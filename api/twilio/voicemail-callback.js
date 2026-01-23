// api/twilio/voicemail-callback.js
// Handles recording completion and sends notifications
import { createRedisClient } from '../utils/redis-client.js';
import { validateTwilioRequest } from '../utils/validate-twilio.js';
import { sendVoicemailEmail } from '../utils/voicemail-email.js';
import { sendDiscordNotification } from '../utils/discord-notify.js';
import { lookupCaller } from '../utils/twilio-lookup.js';

// Configure Vercel to parse form data
export const config = {
  api: {
    bodyParser: true,
  },
};

/**
 * Handles recording completion and sends notifications
 * @param {*} req   Request object
 * @param {*} res   Response object
 * @returns {Promise<void>}
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Validate Twilio webhook signature
  const validation = validateTwilioRequest(req);
  if (!validation.isValid) {
    return res.status(validation.statusCode).json({ error: validation.error });
  }

  try {
    // Initialize Redis
    const redis = createRedisClient();

    // Extract recording data from Twilio callback
    const {
      RecordingSid,
      RecordingUrl,
      RecordingDuration,
      CallSid,
      From,
      To,
      RecordingStatus
    } = req.body;

    console.log('Recording callback received:', {
      RecordingSid,
      RecordingDuration,
      RecordingStatus,
      From
    });

    // Create voicemail record
    const voicemail = {
      id: RecordingSid,
      recordingUrl: RecordingUrl,
      duration: parseInt(RecordingDuration) || 0,
      callSid: CallSid,
      from: From,
      to: To,
      status: RecordingStatus,
      transcription: null, // Will be updated by transcription callback
      createdAt: new Date().toISOString(),
      listened: false
    };

    // Store in Redis
    // Use a sorted set to maintain chronological order
    const timestamp = Date.now();
    await redis.zadd('voicemails:index', {
      score: timestamp,
      member: RecordingSid
    });

    // Store the full voicemail data
    await redis.set(`voicemail:${RecordingSid}`, JSON.stringify(voicemail));

    // Perform caller lookup (async, cached, cost-optimized)
    // This runs in the background and updates the voicemail record if successful
    // Failures are logged but don't block the voicemail from being saved
    (async () => {
      try {
        const lookupData = await lookupCaller(From, redis, false);
        if (lookupData) {
          // Update voicemail with caller information
          voicemail.callerName = lookupData.callerName;
          voicemail.callerType = lookupData.callerType;
          voicemail.lineType = lookupData.lineType;
          voicemail.lineTypeIntelligence = {
            type: lookupData.lineType,
            carrierName: lookupData.carrierName,
            mobileCountryCode: lookupData.mobileCountryCode,
            mobileNetworkCode: lookupData.mobileNetworkCode
          };
          voicemail.lookupLastUpdated = lookupData.lastUpdated;

          // Update voicemail in Redis with enriched data
          try {
            await redis.set(`voicemail:${RecordingSid}`, JSON.stringify(voicemail));
            console.log(`Enriched voicemail ${RecordingSid} with caller lookup data`);
          } catch (err) {
            console.error('Error saving lookup data:', err);
          }
        }
      } catch (err) {
        // Log but don't fail - lookup is optional enhancement
        console.log('Caller lookup failed (non-critical):', err.message);
      }
    })();

    // Send email notification to staff
    // Note: This uses Resend for email delivery
    if (process.env.RESEND_API_KEY && process.env.STAFF_EMAIL) {
      try {
        await sendVoicemailEmail(voicemail, 'new');
      } catch (emailError) {
        console.error('Failed to send email notification:', emailError);
        // Don't fail the request if email fails
      }
    } else {
      console.log('Email notification skipped: Missing RESEND_API_KEY or STAFF_EMAIL');
    }

    // Send Discord notification
    if (process.env.DISCORD_WEBHOOK_URL) {
      try {
        await sendDiscordNotification(voicemail, 'new');
      } catch (discordError) {
        console.error('Failed to send Discord notification:', discordError);
        // Don't fail the request if Discord fails
      }
    } else {
      console.log('Discord notification skipped: Missing DISCORD_WEBHOOK_URL');
    }

    // Return TwiML to end the call gracefully
    const response = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Thank you for your message. An O Cinema staff member will get back to you soon. Goodbye.</Say>
  <Hangup/>
</Response>`;

    res.setHeader('Content-Type', 'text/xml');
    return res.status(200).send(response);

  } catch (error) {
    console.error('Voicemail callback error:', error);

    // Return a simple TwiML response even on error
    const errorResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Thank you. Goodbye.</Say>
  <Hangup/>
</Response>`;

    res.setHeader('Content-Type', 'text/xml');
    return res.status(200).send(errorResponse);
  }
}

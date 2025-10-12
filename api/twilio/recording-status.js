// api/twilio/recording-status.js
// Handles recording status updates from Twilio
import { Redis } from '@upstash/redis';
import twilio from 'twilio';

// Configure Vercel to parse form data
export const config = {
  api: {
    bodyParser: true,
  },
};

/**
 * Handles recording status updates from Twilio
 * @param {*} req   Request object
 * @param {*} res   Result object
 * @returns {Promise<void>}
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Validate Twilio webhook signature
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioSignature = req.headers['x-twilio-signature'];

  if (!authToken) {
    console.error('TWILIO_AUTH_TOKEN not configured');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // Construct the full URL that Twilio used to make the request
  // Must match exactly what Twilio used for signature generation
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;

  // Remove query string from URL for validation - Twilio includes params in body
  const urlPath = req.url.split('?')[0];
  const url = `${protocol}://${host}${urlPath}`;

  console.log('Validating Twilio signature:', {
    url,
    protocol,
    host,
    hasSignature: !!twilioSignature,
    bodyKeys: Object.keys(req.body || {})
  });

  const isValidRequest = twilio.validateRequest(
    authToken,
    twilioSignature,
    url,
    req.body || {}
  );

  if (!isValidRequest) {
    console.error('Invalid Twilio signature', {
      url,
      signature: twilioSignature,
      bodyKeys: Object.keys(req.body || {})
    });
    return res.status(403).json({ error: 'Forbidden - Invalid signature' });
  }

  try{
    // Initialize Redis
    const redis = new Redis({
      url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
    });

    // Extract recording status data from Twilio callback
    const {
      RecordingSid,
      RecordingUrl,
      RecordingStatus,
      RecordingDuration,
      RecordingChannels,
      RecordingSource,
      ErrorCode
    } = req.body;

    console.log('Recording status update:', {
      RecordingSid,
      RecordingStatus,
      RecordingDuration,
      ErrorCode
    });

    // Update voicemail record with status information
    if (RecordingSid) {
      const voicemailData = await redis.get(`voicemail:${RecordingSid}`);

      if (voicemailData) {
        const voicemail = typeof voicemailData === 'string'
          ? JSON.parse(voicemailData)
          : voicemailData;

        // Update status information
        voicemail.recordingStatus = RecordingStatus;
        voicemail.recordingChannels = RecordingChannels;
        voicemail.recordingSource = RecordingSource;
        voicemail.statusUpdatedAt = new Date().toISOString();

        if (ErrorCode) {
          voicemail.errorCode = ErrorCode;
          console.error(`Recording error for ${RecordingSid}: ${ErrorCode}`);
        }

        // If status is completed and we have a duration, update it
        if (RecordingStatus === 'completed' && RecordingDuration) {
          voicemail.duration = parseInt(RecordingDuration);
        }

        // Save updated voicemail
        await redis.set(`voicemail:${RecordingSid}`, JSON.stringify(voicemail));

        console.log(`Recording status updated for voicemail ${RecordingSid}`);
      }
    }

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('Recording status callback error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

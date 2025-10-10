// api/twilio/voicemail-transcription.js
// Handles transcription completion and updates voicemail record
import { Redis } from '@upstash/redis';
import twilio from 'twilio';
import { sendVoicemailEmail } from '../utils/voicemail-email.js';

/**
 * Handles transcription updates from Twilio
 * @param {*} req   Request object
 * @param {*} res   Response object
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

  try {
    // Initialize Redis
    const redis = new Redis({
      url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
    });

    // Extract transcription data from Twilio callback
    const {
      TranscriptionSid,
      TranscriptionText,
      TranscriptionStatus,
      RecordingSid,
      TranscriptionUrl
    } = req.body;

    console.log('Transcription callback received:', {
      TranscriptionSid,
      TranscriptionStatus,
      RecordingSid
    });

    if (TranscriptionStatus === 'completed' && RecordingSid) {
      // Retrieve existing voicemail record
      const voicemailData = await redis.get(`voicemail:${RecordingSid}`);

      if (voicemailData) {
        const voicemail = typeof voicemailData === 'string'
          ? JSON.parse(voicemailData)
          : voicemailData;

        // Update with transcription
        voicemail.transcription = TranscriptionText;
        voicemail.transcriptionSid = TranscriptionSid;
        voicemail.transcriptionUrl = TranscriptionUrl;
        voicemail.transcriptionUpdatedAt = new Date().toISOString();

        // Save updated voicemail
        await redis.set(`voicemail:${RecordingSid}`, JSON.stringify(voicemail));

        console.log(`Transcription added to voicemail ${RecordingSid}`);

        // Optionally send updated email notification with transcription
        if (process.env.RESEND_API_KEY && process.env.STAFF_EMAIL && TranscriptionText) {
          try {
            await sendVoicemailEmail(voicemail, 'transcription');
          } catch (emailError) {
            console.error('Failed to send transcription email:', emailError);
          }
        }

      
      } else {
        console.warn(`Voicemail ${RecordingSid} not found for transcription update`);
      }
    }

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('Transcription callback error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

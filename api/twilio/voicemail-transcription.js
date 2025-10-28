// api/twilio/voicemail-transcription.js
// Handles transcription completion and updates voicemail record
import { createRedisClient } from '../utils/redis-client.js';
import { validateTwilioRequest } from '../utils/validate-twilio.js';
import { sendVoicemailEmail } from '../utils/voicemail-email.js';

// Configure Vercel to parse form data
export const config = {
  api: {
    bodyParser: true,
  },
};

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
  const validation = validateTwilioRequest(req);
  if (!validation.isValid) {
    return res.status(validation.statusCode).json({ error: validation.error });
  }

  try {
    // Initialize Redis
    const redis = createRedisClient();

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

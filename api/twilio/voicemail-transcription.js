// api/twilio/voicemail-transcription.js
// Handles transcription completion and updates voicemail record
import { Redis } from '@upstash/redis';

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
            await sendTranscriptionEmail(voicemail);
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

/**
 * Sends an email notification to the staff with the transcription
 * @param {*} voicemail 
 * @returns {Promise<void>}
 */
async function sendTranscriptionEmail(voicemail) {
  // Using Resend API for email delivery
  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);

  const emailData = {
    from: process.env.FROM_EMAIL || 'O Cinema Voicemail <onboarding@resend.dev>',
    to: process.env.STAFF_EMAIL,
    subject: `Voicemail Transcription from ${voicemail.from}`,
    html: `
      <h2>Voicemail Transcription Available</h2>
      <p><strong>From:</strong> ${voicemail.from}</p>
      <p><strong>Duration:</strong> ${voicemail.duration} seconds</p>
      <p><strong>Received:</strong> ${new Date(voicemail.createdAt).toLocaleString()}</p>
      <hr/>
      <h3>Transcription:</h3>
      <p>${voicemail.transcription}</p>
      <hr/>
      <p><strong>Recording:</strong> <a href="${voicemail.recordingUrl}">Listen to Recording</a></p>
    `
  };

  const { data, error } = await resend.emails.send(emailData);

  if (error) {
    throw new Error(`Resend API error: ${error.message}`);
  }

  console.log('Transcription email sent successfully:', data.id);
}

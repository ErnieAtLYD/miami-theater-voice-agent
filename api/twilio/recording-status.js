// api/twilio/recording-status.js
// Handles recording status updates from Twilio
import { createRedisClient } from '../utils/redis-client.js';
import { validateTwilioRequest } from '../utils/validate-twilio.js';

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
  const validation = validateTwilioRequest(req);
  if (!validation.isValid) {
    return res.status(validation.statusCode).json({ error: validation.error });
  }

  try {
    // Initialize Redis
    const redis = createRedisClient();

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

        // Only log actual errors (ErrorCode 0 means no error)
        if (ErrorCode && ErrorCode !== '0' && ErrorCode !== 0) {
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

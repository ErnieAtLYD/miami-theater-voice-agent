// api/twilio/voicemail-callback.js
// Handles recording completion and sends notifications
import { Redis } from '@upstash/redis';
import twilio from 'twilio';
import { sendVoicemailEmail } from '../utils/voicemail-email.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Validate Twilio webhook signature
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioSignature = req.headers['x-twilio-signature'];
  const url = `https://${req.headers.host}${req.url}`;

  if (!authToken) {
    console.error('TWILIO_AUTH_TOKEN not configured');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const isValidRequest = twilio.validateRequest(
    authToken,
    twilioSignature,
    url,
    req.body
  );

  if (!isValidRequest) {
    console.error('Invalid Twilio signature');
    return res.status(403).json({ error: 'Forbidden - Invalid signature' });
  }

  try {
    // Initialize Redis
    const redis = new Redis({
      url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
    });

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

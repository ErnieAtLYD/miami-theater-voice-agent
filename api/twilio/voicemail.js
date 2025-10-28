// api/twilio/voicemail.js
// Twilio voicemail TwiML endpoint
import twilio from 'twilio';

const { twiml } = twilio;

// Configure Vercel to parse form data
export const config = {
  api: {
    bodyParser: true, // Enable body parsing
  },
};

/**
 * Twilio voicemail TwiML endpoint
 * @param {*} req   Request object
 * @param {*} res   Response object
 * @returns {Promise<void>}
 */
export default async function handler(req, res) {

  // Construct base URL with proper fallback strategy
  const baseUrl = process.env.BASE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    (req.headers.host ? `https://${req.headers.host}` : null) ||
    'https://miami-theater-voice-agent.vercel.app'; // Final fallback
  
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Create TwiML response
    const voiceResponse = new twiml.VoiceResponse();

    // Greeting message
    voiceResponse.say({
      voice: 'alice',
      language: 'en-US'
    }, 'Please leave a detailed message after the beep. Press the star key when you are finished.');

    // Record the voicemail
    voiceResponse.record({
      // Maximum recording length: 3 minutes (180 seconds)
      maxLength: 180,
      // Finish recording when caller presses *
      finishOnKey: '*',
      // Play a beep before recording
      playBeep: true,
      // Trim silence from the beginning and end
      trim: 'trim-silence',
      // Callback URL for when recording is complete
      action: `${baseUrl}/api/twilio/voicemail-callback`,
      method: 'POST',
      // Enable transcription
      transcribe: true,
      // Callback URL for transcription
      transcribeCallback: `${baseUrl}/api/twilio/voicemail-transcription`,
      // Recording status callback
      recordingStatusCallback: `${baseUrl}/api/twilio/recording-status`,
      recordingStatusCallbackMethod: 'POST',
      recordingStatusCallbackEvent: ['completed']
    });

    // Fallback message if no recording is detected
    voiceResponse.say({
      voice: 'alice',
      language: 'en-US'
    }, 'We did not receive your message. Goodbye.');

    // Hang up
    voiceResponse.hangup();

    // Return TwiML as XML
    res.setHeader('Content-Type', 'text/xml');
    return res.status(200).send(voiceResponse.toString());

  } catch (error) {
    console.error('Voicemail TwiML error:', error);

    // Return a simple error TwiML response
    const errorResponse = new twiml.VoiceResponse();
    errorResponse.say({
      voice: 'alice',
      language: 'en-US'
    }, 'We are sorry, but we are unable to take your message at this time. Please try again later.');
    errorResponse.hangup();

    res.setHeader('Content-Type', 'text/xml');
    return res.status(200).send(errorResponse.toString());
  }
}

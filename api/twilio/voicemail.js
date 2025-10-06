// api/twilio/voicemail.js
// Twilio voicemail TwiML endpoint
import twilio from 'twilio';

const { twiml } = twilio;

/**
 * Twilio voicemail TwiML endpoint
 * @param {*} req   Request object
 * @param {*} res   Response object
 * @returns {Promise<void>}
 */
export default async function handler(req, res) {

  // Comprehensive logging for debugging
  const requestLog = {
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.url,
    headers: {
      'content-type': req.headers['content-type'],
      'user-agent': req.headers['user-agent'],
      'x-twilio-signature': req.headers['x-twilio-signature'],
      'origin': req.headers.origin,
      'host': req.headers.host
    },
    body: req.body,
    query: req.query
  };

  console.log('=== VOICEMAIL ENDPOINT CALLED ===');
  console.log(JSON.stringify(requestLog, null, 2));

  // Construct base URL with proper fallback strategy
  // Avoid double https:// prefix
  let baseUrl;
  if (process.env.BASE_URL) {
    baseUrl = process.env.BASE_URL;
  } else if (process.env.VERCEL_URL) {
    // VERCEL_URL doesn't include protocol
    baseUrl = `https://${process.env.VERCEL_URL}`;
  } else if (req.headers.host) {
    baseUrl = `https://${req.headers.host}`;
  } else {
    baseUrl = 'https://miami-theater-voice-agent.vercel.app';
  }

  console.log(`Base URL constructed: ${baseUrl}`);

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
    // Extract context from the ElevenLabs tool call or Twilio request
    const { reason, caller_context, From, To, CallSid } = req.body || {};

    console.log('Request context:', {
      reason,
      caller_context,
      From,
      To,
      CallSid,
      source: From ? 'Twilio' : 'ElevenLabs/Other'
    });

    // Create TwiML response
    const voiceResponse = new twiml.VoiceResponse();

    // Greeting message
    voiceResponse.say({
      voice: 'alice',
      language: 'en-US'
    }, 'Please leave a detailed message after the beep. Press the star key when you are finished.');

    // Construct callback URLs
    const callbackUrls = {
      action: `${baseUrl}/api/twilio/voicemail-callback`,
      transcribeCallback: `${baseUrl}/api/twilio/voicemail-transcription`,
      recordingStatusCallback: `${baseUrl}/api/twilio/recording-status`
    };

    console.log('Callback URLs configured:', callbackUrls);

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
      action: callbackUrls.action,
      method: 'POST',
      // Enable transcription
      transcribe: true,
      // Callback URL for transcription
      transcribeCallback: callbackUrls.transcribeCallback,
      // Recording status callback
      recordingStatusCallback: callbackUrls.recordingStatusCallback,
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

    // Log the TwiML being returned
    const twimlResponse = voiceResponse.toString();
    console.log('TwiML Response generated:');
    console.log(twimlResponse);
    console.log('=== END VOICEMAIL ENDPOINT ===');

    // Return TwiML as XML
    res.setHeader('Content-Type', 'text/xml');
    return res.status(200).send(twimlResponse);

  } catch (error) {
    console.error('=== VOICEMAIL ENDPOINT ERROR ===');
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    console.error('=== END ERROR ===');

    // Return a simple error TwiML response
    const errorResponse = new twiml.VoiceResponse();
    errorResponse.say({
      voice: 'alice',
      language: 'en-US'
    }, 'We are sorry, but we are unable to take your message at this time. Please try again later.');
    errorResponse.hangup();

    const errorTwiml = errorResponse.toString();
    console.log('Error TwiML response:', errorTwiml);

    res.setHeader('Content-Type', 'text/xml');
    return res.status(200).send(errorTwiml);
  }
}

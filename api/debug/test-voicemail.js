// api/debug/test-voicemail.js
// Test endpoint to simulate voicemail calls from different sources

/**
 * Test voicemail endpoint with simulated requests
 * @param {*} req   Request object
 * @param {*} res   Response object
 * @returns {Promise<void>}
 */
export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { source = 'elevenlabs' } = req.query;

  try {
    const baseUrl = process.env.BASE_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
      (req.headers.host ? `https://${req.headers.host}` : null) ||
      'https://miami-theater-voice-agent.vercel.app';

    const voicemailUrl = `${baseUrl}/api/twilio/voicemail`;

    let testPayload;
    let testHeaders = {
      'Content-Type': 'application/json'
    };

    // Simulate different sources
    if (source === 'elevenlabs') {
      testPayload = {
        reason: 'Test voicemail from ElevenLabs simulation',
        caller_context: 'User asked to speak to a manager'
      };
      testHeaders['User-Agent'] = 'ElevenLabs-Test/1.0';
    } else if (source === 'twilio') {
      testPayload = {
        From: '+15551234567',
        To: '+15559876543',
        CallSid: 'CA' + 'x'.repeat(32),
        CallStatus: 'in-progress'
      };
      testHeaders['User-Agent'] = 'TwilioProxy/1.1';
      // Note: In real scenario, Twilio would send x-twilio-signature
    } else {
      return res.status(400).json({
        error: 'Invalid source',
        validSources: ['elevenlabs', 'twilio']
      });
    }

    // Make the test call
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(voicemailUrl, {
      method: 'POST',
      headers: testHeaders,
      body: JSON.stringify(testPayload)
    });

    const contentType = response.headers.get('content-type');
    const responseText = await response.text();

    return res.status(200).json({
      test: 'voicemail-endpoint',
      source,
      request: {
        url: voicemailUrl,
        headers: testHeaders,
        payload: testPayload
      },
      response: {
        status: response.status,
        contentType,
        body: responseText,
        bodyPreview: responseText.substring(0, 200) + (responseText.length > 200 ? '...' : '')
      },
      notes: [
        'Check Vercel logs for detailed request logging',
        'TwiML responses are expected for Twilio source',
        'ElevenLabs source will receive TwiML but cannot process it (this is the problem!)'
      ]
    });

  } catch (error) {
    console.error('Test voicemail error:', error);
    return res.status(500).json({
      error: 'Test failed',
      message: error.message,
      stack: error.stack
    });
  }
}

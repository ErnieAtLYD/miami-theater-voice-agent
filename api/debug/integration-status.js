// api/debug/integration-status.js
// Health check and status endpoint for voicemail integration

import { Redis } from '@upstash/redis';

/**
 * Integration status and health check endpoint
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

  const status = {
    timestamp: new Date().toISOString(),
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      vercelUrl: process.env.VERCEL_URL || 'not set',
      baseUrl: process.env.BASE_URL || 'not set'
    },
    configuration: {
      twilio: {
        accountSid: process.env.TWILIO_ACCOUNT_SID ? '✓ Set' : '✗ Missing',
        authToken: process.env.TWILIO_AUTH_TOKEN ? '✓ Set' : '✗ Missing'
      },
      redis: {
        url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL ? '✓ Set' : '✗ Missing',
        token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN ? '✓ Set' : '✗ Missing'
      },
      email: {
        resendApiKey: process.env.RESEND_API_KEY ? '✓ Set' : '✗ Missing',
        staffEmail: process.env.STAFF_EMAIL ? '✓ Set' : '✗ Missing',
        fromEmail: process.env.FROM_EMAIL || 'using default'
      }
    },
    endpoints: {
      voicemail: '/api/twilio/voicemail',
      callback: '/api/twilio/voicemail-callback',
      transcription: '/api/twilio/voicemail-transcription',
      recordingStatus: '/api/twilio/recording-status',
      voicemailList: '/api/voicemail/list'
    },
    issues: [],
    recommendations: []
  };

  // Check for missing configuration
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    status.issues.push('Twilio credentials not configured');
    status.recommendations.push('Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN environment variables');
  }

  if (!process.env.KV_REST_API_URL && !process.env.UPSTASH_REDIS_REST_URL) {
    status.issues.push('Redis connection not configured');
    status.recommendations.push('Set KV_REST_API_URL and KV_REST_API_TOKEN (or UPSTASH_REDIS_* equivalents)');
  }

  if (!process.env.RESEND_API_KEY || !process.env.STAFF_EMAIL) {
    status.issues.push('Email notifications not configured');
    status.recommendations.push('Set RESEND_API_KEY and STAFF_EMAIL for voicemail notifications');
  }

  // Test Redis connection
  try {
    const redis = new Redis({
      url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
    });

    // Try to ping Redis
    await redis.set('health_check', Date.now(), { ex: 10 });
    const testValue = await redis.get('health_check');

    status.redis = {
      connected: true,
      testWrite: testValue ? '✓ Success' : '✗ Failed'
    };
  } catch (error) {
    status.redis = {
      connected: false,
      error: error.message
    };
    status.issues.push('Redis connection failed: ' + error.message);
  }

  // Check recent voicemails count
  try {
    const redis = new Redis({
      url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
    });

    const voicemailCount = await redis.zcard('voicemails:index');
    status.voicemails = {
      total: voicemailCount || 0
    };
  } catch (error) {
    status.voicemails = {
      error: 'Could not fetch voicemail count'
    };
  }

  // Architecture issue warning
  status.architectureWarning = {
    issue: 'ElevenLabs webhook tool cannot process TwiML responses',
    description: 'The current voicemail-tool-config.json uses a webhook tool, but ElevenLabs webhooks expect JSON responses, not TwiML XML. This integration will not work as designed.',
    correctApproach: 'Use ElevenLabs transfer_to_number system tool to transfer calls to a Twilio phone number, which then requests the TwiML endpoint.',
    documentation: 'See README-VOICEMAIL-INTEGRATION.md for proper setup instructions'
  };

  // Determine overall status
  const hasErrors = status.issues.length > 0;
  status.overallStatus = hasErrors ? 'degraded' : 'healthy';
  status.configuredCorrectly = !hasErrors && status.architectureWarning;

  return res.status(hasErrors ? 500 : 200).json(status);
}

// api/debug/test-components.js
// Test individual components of the voicemail integration

import { Redis } from '@upstash/redis';
import twilio from 'twilio';

/**
 * Test individual components
 * @param {*} req   Request object
 * @param {*} res   Response object
 * @returns {Promise<void>}
 */
export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { component = 'all' } = req.query;
  const results = {
    timestamp: new Date().toISOString(),
    component,
    tests: {}
  };

  // Test 1: Redis Connection
  if (component === 'all' || component === 'redis') {
    try {
      const redis = new Redis({
        url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
      });

      const testKey = `test:${Date.now()}`;
      const testValue = { test: true, timestamp: Date.now() };

      await redis.set(testKey, JSON.stringify(testValue), { ex: 60 });
      const retrieved = await redis.get(testKey);
      await redis.del(testKey);

      results.tests.redis = {
        status: 'passed',
        operations: {
          set: '✓',
          get: retrieved ? '✓' : '✗',
          delete: '✓'
        }
      };
    } catch (error) {
      results.tests.redis = {
        status: 'failed',
        error: error.message
      };
    }
  }

  // Test 2: TwiML Generation
  if (component === 'all' || component === 'twiml') {
    try {
      const { twiml } = twilio;
      const voiceResponse = new twiml.VoiceResponse();

      voiceResponse.say({
        voice: 'alice',
        language: 'en-US'
      }, 'This is a test message.');

      voiceResponse.record({
        maxLength: 180,
        finishOnKey: '*',
        transcribe: true
      });

      voiceResponse.hangup();

      const twimlOutput = voiceResponse.toString();

      results.tests.twiml = {
        status: 'passed',
        output: twimlOutput,
        size: twimlOutput.length,
        validXml: twimlOutput.includes('<?xml') && twimlOutput.includes('</Response>')
      };
    } catch (error) {
      results.tests.twiml = {
        status: 'failed',
        error: error.message
      };
    }
  }

  // Test 3: Twilio Signature Validation
  if (component === 'all' || component === 'twilio-signature') {
    try {
      const authToken = process.env.TWILIO_AUTH_TOKEN;

      if (!authToken) {
        throw new Error('TWILIO_AUTH_TOKEN not configured');
      }

      const testUrl = 'https://example.com/test';
      const testParams = { From: '+15551234567', To: '+15559876543' };
      const testSignature = twilio.validateRequest(authToken, 'invalid', testUrl, testParams);

      results.tests.twilioSignature = {
        status: 'passed',
        note: 'Twilio signature validation library loaded successfully',
        authTokenConfigured: true
      };
    } catch (error) {
      results.tests.twilioSignature = {
        status: 'failed',
        error: error.message
      };
    }
  }

  // Test 4: Email Configuration
  if (component === 'all' || component === 'email') {
    try {
      const hasResendKey = !!process.env.RESEND_API_KEY;
      const hasStaffEmail = !!process.env.STAFF_EMAIL;

      if (!hasResendKey || !hasStaffEmail) {
        throw new Error('Email configuration incomplete');
      }

      results.tests.email = {
        status: 'passed',
        configuration: {
          resendApiKey: hasResendKey ? '✓ Configured' : '✗ Missing',
          staffEmail: hasStaffEmail ? process.env.STAFF_EMAIL : '✗ Missing',
          fromEmail: process.env.FROM_EMAIL || 'using default (onboarding@resend.dev)'
        },
        note: 'Email configured (not tested - would require actual API call)'
      };
    } catch (error) {
      results.tests.email = {
        status: 'failed',
        error: error.message
      };
    }
  }

  // Test 5: URL Construction
  if (component === 'all' || component === 'urls') {
    try {
      let baseUrl;
      if (process.env.BASE_URL) {
        baseUrl = process.env.BASE_URL;
      } else if (process.env.VERCEL_URL) {
        baseUrl = `https://${process.env.VERCEL_URL}`;
      } else if (req.headers.host) {
        baseUrl = `https://${req.headers.host}`;
      } else {
        baseUrl = 'https://miami-theater-voice-agent.vercel.app';
      }

      const callbackUrls = {
        action: `${baseUrl}/api/twilio/voicemail-callback`,
        transcribeCallback: `${baseUrl}/api/twilio/voicemail-transcription`,
        recordingStatusCallback: `${baseUrl}/api/twilio/recording-status`
      };

      // Validate URLs
      const urlsValid = Object.values(callbackUrls).every(url => {
        try {
          new URL(url);
          return true;
        } catch {
          return false;
        }
      });

      results.tests.urls = {
        status: urlsValid ? 'passed' : 'failed',
        baseUrl,
        callbackUrls,
        validation: urlsValid ? 'All URLs are valid' : 'Some URLs are invalid'
      };
    } catch (error) {
      results.tests.urls = {
        status: 'failed',
        error: error.message
      };
    }
  }

  // Summary
  const allTests = Object.values(results.tests);
  const passedTests = allTests.filter(t => t.status === 'passed').length;
  const failedTests = allTests.filter(t => t.status === 'failed').length;

  results.summary = {
    total: allTests.length,
    passed: passedTests,
    failed: failedTests,
    overallStatus: failedTests === 0 ? 'healthy' : 'degraded'
  };

  return res.status(200).json(results);
}

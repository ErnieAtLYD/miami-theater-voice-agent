import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { validateTwilioRequest } from '../../api/utils/validate-twilio.js';
import crypto from 'crypto';

// Helper to generate Twilio signature (same algorithm Twilio uses)
function getExpectedTwilioSignature(authToken, url, params) {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);

  return crypto
    .createHmac('sha1', authToken)
    .update(Buffer.from(data, 'utf-8'))
    .digest('base64');
}

// Helper to create mock request objects
function createMockRequest(overrides = {}) {
  const defaultParams = {
    RecordingSid: 'RExxxxx',
    RecordingUrl: 'https://api.twilio.com/recordings/RExxxxx',
    CallSid: 'CAxxxxx',
    From: '+12345678901',
    To: '+19876543210'
  };

  const params = { ...defaultParams, ...overrides.body };
  const url = overrides.url || '/api/twilio/voicemail-callback';
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  // Construct full URL
  const protocol = overrides.protocol || 'https';
  const host = overrides.host || 'miami-theater-voice-agent.vercel.app';
  const fullUrl = `${protocol}://${host}${url.split('?')[0]}`;

  // Generate valid signature for these params
  const signature = overrides.invalidSignature
    ? 'invalid-signature-xyz'
    : getExpectedTwilioSignature(authToken, fullUrl, params);

  return {
    method: 'POST',
    url: url,
    headers: {
      'x-twilio-signature': signature,
      'x-forwarded-proto': protocol,
      'x-forwarded-host': host,
      host: host,
      ...overrides.headers
    },
    body: params
  };
}

describe('validateTwilioRequest', () => {
  const originalEnv = process.env.TWILIO_AUTH_TOKEN;

  afterEach(() => {
    // Restore original env var after each test
    if (originalEnv) {
      process.env.TWILIO_AUTH_TOKEN = originalEnv;
    }
  });

  describe('Valid Twilio requests', () => {
    test('accepts request with valid signature', () => {
      const req = createMockRequest();

      const result = validateTwilioRequest(req);

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.statusCode).toBeUndefined();
    });

    test('accepts request from voicemail-callback endpoint', () => {
      const req = createMockRequest({
        url: '/api/twilio/voicemail-callback'
      });

      const result = validateTwilioRequest(req);

      expect(result.isValid).toBe(true);
    });

    test('accepts request from voicemail-transcription endpoint', () => {
      const req = createMockRequest({
        url: '/api/twilio/voicemail-transcription',
        body: {
          TranscriptionSid: 'TRxxxxx',
          RecordingSid: 'RExxxxx',
          TranscriptionText: 'Test transcription'
        }
      });

      const result = validateTwilioRequest(req);

      expect(result.isValid).toBe(true);
    });

    test('accepts request from recording-status endpoint', () => {
      const req = createMockRequest({
        url: '/api/twilio/recording-status',
        body: {
          RecordingSid: 'RExxxxx',
          RecordingStatus: 'completed'
        }
      });

      const result = validateTwilioRequest(req);

      expect(result.isValid).toBe(true);
    });

    test('accepts request with empty body', () => {
      const req = createMockRequest({
        body: {}
      });

      const result = validateTwilioRequest(req);

      expect(result.isValid).toBe(true);
    });
  });

  describe('Invalid Twilio requests', () => {
    test('rejects request with invalid signature', () => {
      const req = createMockRequest({
        invalidSignature: true
      });

      const result = validateTwilioRequest(req);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Forbidden - Invalid signature');
      expect(result.statusCode).toBe(403);
    });

    test('rejects request when body params are modified', () => {
      const req = createMockRequest();
      // Modify body after signature generation
      req.body.RecordingSid = 'MODIFIED';

      const result = validateTwilioRequest(req);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Forbidden - Invalid signature');
      expect(result.statusCode).toBe(403);
    });

    test('rejects request when URL does not match signature', () => {
      const req = createMockRequest({
        url: '/api/twilio/voicemail-callback'
      });
      // Change URL after signature generation
      req.url = '/api/twilio/different-endpoint';

      const result = validateTwilioRequest(req);

      expect(result.isValid).toBe(false);
      expect(result.statusCode).toBe(403);
    });

    test('rejects request with missing signature header', () => {
      const req = createMockRequest();
      delete req.headers['x-twilio-signature'];

      const result = validateTwilioRequest(req);

      expect(result.isValid).toBe(false);
      expect(result.statusCode).toBe(403);
    });

    test('rejects request with empty signature', () => {
      const req = createMockRequest();
      req.headers['x-twilio-signature'] = '';

      const result = validateTwilioRequest(req);

      expect(result.isValid).toBe(false);
      expect(result.statusCode).toBe(403);
    });
  });

  describe('Configuration errors', () => {
    test('returns 500 when TWILIO_AUTH_TOKEN is not configured', () => {
      delete process.env.TWILIO_AUTH_TOKEN;

      // Create a simple request without using createMockRequest (which requires auth token)
      const req = {
        method: 'POST',
        url: '/api/twilio/voicemail-callback',
        headers: {
          'x-twilio-signature': 'some-signature',
          'x-forwarded-proto': 'https',
          'x-forwarded-host': 'miami-theater-voice-agent.vercel.app',
          host: 'miami-theater-voice-agent.vercel.app'
        },
        body: { RecordingSid: 'RExxxxx' }
      };

      const result = validateTwilioRequest(req);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Server configuration error');
      expect(result.statusCode).toBe(500);
    });

    test('returns 500 when TWILIO_AUTH_TOKEN is empty string', () => {
      process.env.TWILIO_AUTH_TOKEN = '';

      const req = {
        method: 'POST',
        url: '/api/twilio/voicemail-callback',
        headers: {
          'x-twilio-signature': 'some-signature',
          'x-forwarded-proto': 'https',
          'x-forwarded-host': 'miami-theater-voice-agent.vercel.app',
          host: 'miami-theater-voice-agent.vercel.app'
        },
        body: { RecordingSid: 'RExxxxx' }
      };

      const result = validateTwilioRequest(req);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Server configuration error');
      expect(result.statusCode).toBe(500);
    });
  });

  describe('URL construction', () => {
    test('constructs URL correctly with x-forwarded headers', () => {
      const req = createMockRequest({
        protocol: 'https',
        host: 'miami-theater-voice-agent.vercel.app',
        url: '/api/twilio/voicemail-callback'
      });

      const result = validateTwilioRequest(req);

      expect(result.isValid).toBe(true);
    });

    test('falls back to host header when x-forwarded-host is missing', () => {
      const req = createMockRequest({
        host: 'fallback-host.com',
        url: '/api/twilio/voicemail-callback'
      });
      delete req.headers['x-forwarded-host'];

      const result = validateTwilioRequest(req);

      expect(result.isValid).toBe(true);
    });

    test('falls back to https when x-forwarded-proto is missing', () => {
      const req = createMockRequest({
        url: '/api/twilio/voicemail-callback'
      });
      delete req.headers['x-forwarded-proto'];

      const result = validateTwilioRequest(req);

      expect(result.isValid).toBe(true);
    });

    test('strips query string from URL before validation', () => {
      const req = createMockRequest({
        url: '/api/twilio/voicemail-callback?debug=true&test=1'
      });

      const result = validateTwilioRequest(req);

      expect(result.isValid).toBe(true);
    });

    test('handles URL without query string', () => {
      const req = createMockRequest({
        url: '/api/twilio/voicemail-callback'
      });

      const result = validateTwilioRequest(req);

      expect(result.isValid).toBe(true);
    });
  });

  describe('Edge cases', () => {
    test('handles null body', () => {
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const url = 'https://miami-theater-voice-agent.vercel.app/api/twilio/test';
      const signature = getExpectedTwilioSignature(authToken, url, {});

      const req = {
        url: '/api/twilio/test',
        headers: {
          'x-twilio-signature': signature,
          'x-forwarded-proto': 'https',
          'x-forwarded-host': 'miami-theater-voice-agent.vercel.app',
          host: 'miami-theater-voice-agent.vercel.app'
        },
        body: null
      };

      const result = validateTwilioRequest(req);

      expect(result.isValid).toBe(true);
    });

    test('handles undefined body', () => {
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const url = 'https://miami-theater-voice-agent.vercel.app/api/twilio/test';
      const signature = getExpectedTwilioSignature(authToken, url, {});

      const req = {
        url: '/api/twilio/test',
        headers: {
          'x-twilio-signature': signature,
          'x-forwarded-proto': 'https',
          'x-forwarded-host': 'miami-theater-voice-agent.vercel.app',
          host: 'miami-theater-voice-agent.vercel.app'
        },
        body: undefined
      };

      const result = validateTwilioRequest(req);

      expect(result.isValid).toBe(true);
    });

    test('handles body with special characters', () => {
      const req = createMockRequest({
        body: {
          RecordingSid: 'RExxxxx',
          TranscriptionText: 'Test with special chars: !@#$%^&*()'
        }
      });

      const result = validateTwilioRequest(req);

      expect(result.isValid).toBe(true);
    });

    test('handles body with unicode characters', () => {
      const req = createMockRequest({
        body: {
          RecordingSid: 'RExxxxx',
          TranscriptionText: 'Test with unicode: 你好世界 🎬🎭'
        }
      });

      const result = validateTwilioRequest(req);

      expect(result.isValid).toBe(true);
    });

    test('handles very long body values', () => {
      const longText = 'A'.repeat(10000);
      const req = createMockRequest({
        body: {
          RecordingSid: 'RExxxxx',
          TranscriptionText: longText
        }
      });

      const result = validateTwilioRequest(req);

      expect(result.isValid).toBe(true);
    });
  });

  describe('Different endpoints', () => {
    test('validates voicemail endpoint', () => {
      const req = createMockRequest({
        url: '/api/twilio/voicemail'
      });

      const result = validateTwilioRequest(req);

      expect(result.isValid).toBe(true);
    });

    test('validates callback endpoint', () => {
      const req = createMockRequest({
        url: '/api/twilio/voicemail-callback'
      });

      const result = validateTwilioRequest(req);

      expect(result.isValid).toBe(true);
    });

    test('validates transcription endpoint', () => {
      const req = createMockRequest({
        url: '/api/twilio/voicemail-transcription'
      });

      const result = validateTwilioRequest(req);

      expect(result.isValid).toBe(true);
    });

    test('validates recording-status endpoint', () => {
      const req = createMockRequest({
        url: '/api/twilio/recording-status'
      });

      const result = validateTwilioRequest(req);

      expect(result.isValid).toBe(true);
    });
  });

  describe('Security', () => {
    test('rejects forged requests from different domain', () => {
      const req = createMockRequest({
        host: 'attacker.com'
      });
      // Try to use signature from correct domain
      const correctHost = 'miami-theater-voice-agent.vercel.app';
      const url = `https://${correctHost}${req.url.split('?')[0]}`;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      req.headers['x-twilio-signature'] = getExpectedTwilioSignature(
        authToken,
        url,
        req.body
      );

      const result = validateTwilioRequest(req);

      expect(result.isValid).toBe(false);
      expect(result.statusCode).toBe(403);
    });

    test('rejects replay attacks with modified timestamp', () => {
      const req = createMockRequest({
        body: {
          RecordingSid: 'RExxxxx',
          Timestamp: '2024-01-01T00:00:00Z'
        }
      });
      // Modify timestamp after signature generation
      req.body.Timestamp = '2024-12-31T23:59:59Z';

      const result = validateTwilioRequest(req);

      expect(result.isValid).toBe(false);
      expect(result.statusCode).toBe(403);
    });

    test('signature validation is case-sensitive', () => {
      const req = createMockRequest();
      req.headers['x-twilio-signature'] = req.headers['x-twilio-signature'].toLowerCase();

      const result = validateTwilioRequest(req);

      expect(result.isValid).toBe(false);
      expect(result.statusCode).toBe(403);
    });
  });
});

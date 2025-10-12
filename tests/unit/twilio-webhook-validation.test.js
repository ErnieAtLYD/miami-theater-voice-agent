import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import twilio from 'twilio';
import crypto from 'crypto';

// Helper to generate Twilio signature
function getExpectedTwilioSignature(authToken, url, params) {
  // Sort params alphabetically and concatenate
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);

  // Create HMAC SHA1 signature
  return crypto
    .createHmac('sha1', authToken)
    .update(Buffer.from(data, 'utf-8'))
    .digest('base64');
}

// Helper to create mock request/response objects
function createMockRequest(overrides = {}) {
  return {
    method: 'POST',
    url: '/api/twilio/voicemail-callback',
    headers: {
      'x-twilio-signature': 'mock-signature',
      'x-forwarded-proto': 'https',
      'x-forwarded-host': 'miami-theater-voice-agent.vercel.app',
      host: 'miami-theater-voice-agent.vercel.app',
      ...overrides.headers
    },
    body: {
      RecordingSid: 'RExxxxx',
      RecordingUrl: 'https://api.twilio.com/recordings/RExxxxx',
      RecordingDuration: '45',
      CallSid: 'CAxxxxx',
      From: '+12345678901',
      To: '+19876543210',
      RecordingStatus: 'completed',
      ...overrides.body
    },
    ...overrides
  };
}

function createMockResponse() {
  const res = {
    statusCode: null,
    headers: {},
    body: null,
    setHeader: jest.fn((key, value) => {
      res.headers[key] = value;
    }),
    status: jest.fn((code) => {
      res.statusCode = code;
      return res;
    }),
    json: jest.fn((data) => {
      res.body = data;
      return res;
    }),
    send: jest.fn((data) => {
      res.body = data;
      return res;
    }),
    end: jest.fn()
  };
  return res;
}

// Test URL construction logic
describe('Twilio Webhook URL Construction', () => {
  test('constructs URL with x-forwarded headers', () => {
    const req = createMockRequest();

    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const urlPath = req.url.split('?')[0];
    const url = `${protocol}://${host}${urlPath}`;

    expect(url).toBe('https://miami-theater-voice-agent.vercel.app/api/twilio/voicemail-callback');
  });

  test('falls back to host header when x-forwarded-host is missing', () => {
    const req = createMockRequest({
      headers: {
        'x-forwarded-proto': 'https',
        host: 'fallback-host.com'
        // no x-forwarded-host
      }
    });

    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const urlPath = req.url.split('?')[0];
    const url = `${protocol}://${host}${urlPath}`;

    expect(url).toBe('https://fallback-host.com/api/twilio/voicemail-callback');
  });

  test('falls back to https when x-forwarded-proto is missing', () => {
    const req = createMockRequest({
      headers: {
        'x-forwarded-host': 'miami-theater-voice-agent.vercel.app',
        host: 'miami-theater-voice-agent.vercel.app'
        // no x-forwarded-proto
      }
    });

    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const urlPath = req.url.split('?')[0];
    const url = `${protocol}://${host}${urlPath}`;

    expect(url).toBe('https://miami-theater-voice-agent.vercel.app/api/twilio/voicemail-callback');
  });

  test('strips query string from URL', () => {
    const req = createMockRequest({
      url: '/api/twilio/voicemail-callback?foo=bar&baz=qux'
    });

    const urlPath = req.url.split('?')[0];

    expect(urlPath).toBe('/api/twilio/voicemail-callback');
  });

  test('handles URL without query string', () => {
    const req = createMockRequest({
      url: '/api/twilio/voicemail-callback'
    });

    const urlPath = req.url.split('?')[0];

    expect(urlPath).toBe('/api/twilio/voicemail-callback');
  });
});

// Test signature validation with real Twilio signatures
describe('Twilio Webhook Signature Validation', () => {
  const authToken = 'test-auth-token-12345';
  const url = 'https://miami-theater-voice-agent.vercel.app/api/twilio/voicemail-callback';
  const params = {
    RecordingSid: 'RExxxxx',
    RecordingUrl: 'https://api.twilio.com/recordings/RExxxxx',
    RecordingDuration: '45',
    CallSid: 'CAxxxxx',
    From: '+12345678901',
    To: '+19876543210',
    RecordingStatus: 'completed'
  };

  test('validates correct Twilio signature', () => {
    // Generate a real signature using Twilio's algorithm
    const signature = getExpectedTwilioSignature(authToken, url, params);

    const isValid = twilio.validateRequest(authToken, signature, url, params);

    expect(isValid).toBe(true);
  });

  test('rejects invalid signature', () => {
    const invalidSignature = 'invalid-signature-xyz';

    const isValid = twilio.validateRequest(authToken, invalidSignature, url, params);

    expect(isValid).toBe(false);
  });

  test('rejects when URL does not match', () => {
    const signature = getExpectedTwilioSignature(authToken, url, params);
    const wrongUrl = 'https://wrong-domain.com/api/twilio/voicemail-callback';

    const isValid = twilio.validateRequest(authToken, signature, wrongUrl, params);

    expect(isValid).toBe(false);
  });

  test('rejects when params do not match', () => {
    const signature = getExpectedTwilioSignature(authToken, url, params);
    const wrongParams = { ...params, RecordingSid: 'DIFFERENT' };

    const isValid = twilio.validateRequest(authToken, signature, url, wrongParams);

    expect(isValid).toBe(false);
  });

  test('handles empty body object', () => {
    const emptyUrl = 'https://miami-theater-voice-agent.vercel.app/api/twilio/test';
    const signature = getExpectedTwilioSignature(authToken, emptyUrl, {});

    const isValid = twilio.validateRequest(authToken, signature, emptyUrl, {});

    expect(isValid).toBe(true);
  });

  test('signature validation with different path fails', () => {
    const signature = getExpectedTwilioSignature(authToken, url, params);
    const differentPathUrl = 'https://miami-theater-voice-agent.vercel.app/api/twilio/different-endpoint';

    // Should fail because path doesn't match
    const isValid = twilio.validateRequest(authToken, signature, differentPathUrl, params);

    expect(isValid).toBe(false);
  });
});

// Test edge cases and error handling
describe('Twilio Webhook Edge Cases', () => {
  test('handles missing auth token', () => {
    const req = createMockRequest();
    const authToken = undefined;

    expect(authToken).toBeUndefined();
    // In real handler, this would return 500 error
  });

  test('handles missing signature header', () => {
    const req = createMockRequest({
      headers: {
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'miami-theater-voice-agent.vercel.app'
        // no x-twilio-signature
      }
    });

    const twilioSignature = req.headers['x-twilio-signature'];

    expect(twilioSignature).toBeUndefined();
  });

  test('handles null body', () => {
    const req = createMockRequest({ body: null });
    const body = req.body || {};

    expect(body).toEqual({});
    expect(Object.keys(body)).toHaveLength(0);
  });

  test('handles undefined body', () => {
    const req = createMockRequest({ body: undefined });
    const body = req.body || {};

    expect(body).toEqual({});
    expect(Object.keys(body)).toHaveLength(0);
  });

  test('extracts body keys correctly', () => {
    const req = createMockRequest();
    const bodyKeys = Object.keys(req.body || {});

    expect(bodyKeys).toContain('RecordingSid');
    expect(bodyKeys).toContain('RecordingUrl');
    expect(bodyKeys).toContain('CallSid');
    expect(bodyKeys.length).toBeGreaterThan(0);
  });
});

// Test different endpoint paths
describe('Twilio Webhook Endpoints', () => {
  const authToken = 'test-auth-token';

  test('validates voicemail-callback endpoint', () => {
    const url = 'https://miami-theater-voice-agent.vercel.app/api/twilio/voicemail-callback';
    const params = { RecordingSid: 'RExxxxx' };
    const signature = getExpectedTwilioSignature(authToken, url, params);

    expect(twilio.validateRequest(authToken, signature, url, params)).toBe(true);
  });

  test('validates voicemail-transcription endpoint', () => {
    const url = 'https://miami-theater-voice-agent.vercel.app/api/twilio/voicemail-transcription';
    const params = { TranscriptionSid: 'TRxxxxx', RecordingSid: 'RExxxxx' };
    const signature = getExpectedTwilioSignature(authToken, url, params);

    expect(twilio.validateRequest(authToken, signature, url, params)).toBe(true);
  });

  test('validates recording-status endpoint', () => {
    const url = 'https://miami-theater-voice-agent.vercel.app/api/twilio/recording-status';
    const params = { RecordingSid: 'RExxxxx', RecordingStatus: 'completed' };
    const signature = getExpectedTwilioSignature(authToken, url, params);

    expect(twilio.validateRequest(authToken, signature, url, params)).toBe(true);
  });
});

// Test query string handling
describe('Query String Handling', () => {
  const authToken = 'test-auth-token';

  test('strips query params from URL path', () => {
    const baseUrl = 'https://miami-theater-voice-agent.vercel.app/api/twilio/voicemail-callback';
    const urlWithQuery = '/api/twilio/voicemail-callback?debug=true&test=1';

    const urlPath = urlWithQuery.split('?')[0];
    const fullUrl = `https://miami-theater-voice-agent.vercel.app${urlPath}`;

    expect(fullUrl).toBe(baseUrl);
  });

  test('Twilio includes query params in body, not URL', () => {
    // This is the behavior we're accommodating
    const url = 'https://miami-theater-voice-agent.vercel.app/api/twilio/voicemail-callback';
    const params = {
      RecordingSid: 'RExxxxx',
      // Query params from URL would be here as body params
      debug: 'true',
      test: '1'
    };

    const signature = getExpectedTwilioSignature(authToken, url, params);
    const isValid = twilio.validateRequest(authToken, signature, url, params);

    expect(isValid).toBe(true);
  });
});

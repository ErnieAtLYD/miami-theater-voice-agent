import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { createMocks } from 'node-mocks-http';
import crypto from 'crypto';

// Helper to generate Twilio signature
function getExpectedTwilioSignature(authToken, url, params) {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);

  return crypto
    .createHmac('sha1', authToken)
    .update(Buffer.from(data, 'utf-8'))
    .digest('base64');
}

// Helper to parse TwiML and extract callback URLs
function parseTwiMLCallbackUrl(twiml, verb = 'Record') {
  const recordMatch = new RegExp(`<${verb}[^>]*action="([^"]*)"`, 'i').exec(twiml);
  return recordMatch ? recordMatch[1] : null;
}

// Mock Redis client
class MockRedis {
  constructor() {
    this.data = new Map();
    this.sortedSets = new Map();
  }

  async get(key) {
    const value = this.data.get(key);
    return value || null;
  }

  async set(key, value) {
    this.data.set(key, value);
    return 'OK';
  }

  async setex(key, ttl, value) {
    this.data.set(key, value);
    return 'OK';
  }

  async zadd(key, options) {
    if (!this.sortedSets.has(key)) {
      this.sortedSets.set(key, []);
    }
    this.sortedSets.get(key).push({
      score: options.score,
      member: options.member
    });
    return 1;
  }

  async zrange(key, start, stop) {
    const set = this.sortedSets.get(key) || [];
    const sorted = set.sort((a, b) => a.score - b.score);

    // Handle Redis-style negative indices
    // -1 means "last element" in Redis, which translates to "no end limit" in slice
    if (stop === -1) {
      return sorted.slice(start).map(item => item.member);
    }

    return sorted.slice(start, stop + 1).map(item => item.member);
  }

  clear() {
    this.data.clear();
    this.sortedSets.clear();
  }
}

describe('Voicemail Callback Flow (E2E Integration Test)', () => {
  let originalEnv;
  let mockRedis;
  let emailSendSpy;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };

    // Set test environment
    process.env.BASE_URL = 'https://miami-theater-voice-agent.vercel.app';
    process.env.TWILIO_AUTH_TOKEN = 'test-auth-token-12345';
    process.env.TWILIO_ACCOUNT_SID = 'ACxxxxx';
    process.env.RESEND_API_KEY = 'test-resend-key';
    process.env.STAFF_EMAIL = 'staff@o-cinema.org';
    process.env.FROM_EMAIL = 'noreply@o-cinema.org';
    process.env.KV_REST_API_URL = 'https://test-redis.upstash.io';
    process.env.KV_REST_API_TOKEN = 'test-token';

    // Create mock Redis instance
    mockRedis = new MockRedis();

    // Mock the email sending function
    emailSendSpy = jest.fn().mockResolvedValue({ id: 'email-123' });
  });

  afterEach(() => {
    // Restore environment
    process.env = originalEnv;
    jest.resetModules();
    jest.clearAllMocks();
    if (mockRedis) {
      mockRedis.clear();
    }
  });

  test('voicemail endpoint returns TwiML with callback URL', async () => {
    // Import handler after setting up environment
    const handler = (await import('../../api/twilio/voicemail.js')).default;

    const { req, res } = createMocks({
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded'
      },
      body: {
        From: '+12345678901',
        To: '+19876543210',
        CallSid: 'CAxxxxx'
      }
    });

    await handler(req, res);

    // Verify response
    expect(res._getStatusCode()).toBe(200);
    expect(res._getHeaders()['content-type']).toBe('text/xml');

    // Parse TwiML response
    const twiml = res._getData();
    expect(twiml).toContain('<Record');
    expect(twiml).toContain('action=');

    // Extract callback URL
    const callbackUrl = parseTwiMLCallbackUrl(twiml, 'Record');
    expect(callbackUrl).toBeTruthy();
    expect(callbackUrl).toContain('/api/twilio/voicemail-callback');
  });

  test('callback is invoked and processes recording data correctly', async () => {
    // Mock @upstash/redis module
    jest.unstable_mockModule('@upstash/redis', () => ({
      Redis: jest.fn(() => mockRedis)
    }));

    // Mock email sending
    jest.unstable_mockModule('../../api/utils/voicemail-email.js', () => ({
      sendVoicemailEmail: emailSendSpy
    }));

    // Re-import handler after mocking
    const callbackHandler = (await import('../../api/twilio/voicemail-callback.js?t=' + Date.now())).default;

    // Prepare callback request data (what Twilio sends)
    const callbackUrl = 'https://miami-theater-voice-agent.vercel.app/api/twilio/voicemail-callback';
    const callbackParams = {
      RecordingSid: 'RE1234567890abcdef1234567890abcdef',
      RecordingUrl: 'https://api.twilio.com/2010-04-01/Accounts/ACxxxxx/Recordings/RE1234567890abcdef1234567890abcdef',
      RecordingDuration: '45',
      CallSid: 'CAxxxxx',
      From: '+12345678901',
      To: '+19876543210',
      RecordingStatus: 'completed'
    };

    // Generate valid Twilio signature
    const signature = getExpectedTwilioSignature(
      process.env.TWILIO_AUTH_TOKEN,
      callbackUrl,
      callbackParams
    );

    // Create callback request
    const { req, res } = createMocks({
      method: 'POST',
      url: '/api/twilio/voicemail-callback',
      headers: {
        'x-twilio-signature': signature,
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'miami-theater-voice-agent.vercel.app',
        'content-type': 'application/x-www-form-urlencoded'
      },
      body: callbackParams
    });

    // Call the callback endpoint
    await callbackHandler(req, res);

    // Verify response
    expect(res._getStatusCode()).toBe(200);
    expect(res._getHeaders()['content-type']).toBe('text/xml');

    const responseTwiml = res._getData();
    expect(responseTwiml).toContain('<Response>');
    expect(responseTwiml).toContain('<Say');
    expect(responseTwiml).toContain('Thank you');
    expect(responseTwiml).toContain('<Hangup');

    // Verify Redis storage
    const storedVoicemail = await mockRedis.get(`voicemail:${callbackParams.RecordingSid}`);
    expect(storedVoicemail).toBeTruthy();

    const voicemailData = JSON.parse(storedVoicemail);
    expect(voicemailData.id).toBe(callbackParams.RecordingSid);
    expect(voicemailData.recordingUrl).toBe(callbackParams.RecordingUrl);
    expect(voicemailData.duration).toBe(45);
    expect(voicemailData.from).toBe(callbackParams.From);
    expect(voicemailData.status).toBe('completed');
    expect(voicemailData.listened).toBe(false);

    // Verify sorted set index
    const indexMembers = await mockRedis.zrange('voicemails:index', 0, -1);
    expect(indexMembers).toContain(callbackParams.RecordingSid);

    // Verify email notification was sent
    expect(emailSendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: callbackParams.RecordingSid,
        recordingUrl: callbackParams.RecordingUrl,
        from: callbackParams.From
      }),
      'new'
    );
  });

  test('callback endpoint rejects invalid Twilio signature', async () => {
    // Mock Redis
    jest.unstable_mockModule('@upstash/redis', () => ({
      Redis: jest.fn(() => mockRedis)
    }));

    const callbackHandler = (await import('../../api/twilio/voicemail-callback.js?t=' + Date.now())).default;

    const callbackParams = {
      RecordingSid: 'RE1234567890abcdef1234567890abcdef',
      RecordingUrl: 'https://api.twilio.com/recordings/RE123',
      RecordingDuration: '45',
      CallSid: 'CAxxxxx',
      From: '+12345678901',
      To: '+19876543210',
      RecordingStatus: 'completed'
    };

    // Create request with INVALID signature
    const { req, res } = createMocks({
      method: 'POST',
      url: '/api/twilio/voicemail-callback',
      headers: {
        'x-twilio-signature': 'invalid-signature-xyz',
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'miami-theater-voice-agent.vercel.app',
        'content-type': 'application/x-www-form-urlencoded'
      },
      body: callbackParams
    });

    await callbackHandler(req, res);

    // Should return 403 Forbidden
    expect(res._getStatusCode()).toBe(403);
    const responseData = JSON.parse(res._getData());
    expect(responseData.error).toContain('Invalid signature');

    // Verify NO data was stored in Redis
    const storedVoicemail = await mockRedis.get(`voicemail:${callbackParams.RecordingSid}`);
    expect(storedVoicemail).toBeNull();
  });

  test('end-to-end flow: voicemail TwiML → callback invocation', async () => {
    // Mock dependencies
    jest.unstable_mockModule('@upstash/redis', () => ({
      Redis: jest.fn(() => mockRedis)
    }));
    jest.unstable_mockModule('../../api/utils/voicemail-email.js', () => ({
      sendVoicemailEmail: emailSendSpy
    }));

    // Step 1: Get TwiML from voicemail endpoint
    const voicemailHandler = (await import('../../api/twilio/voicemail.js?t=' + Date.now())).default;

    const { req: voicemailReq, res: voicemailRes } = createMocks({
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded'
      },
      body: {
        From: '+12345678901',
        To: '+19876543210',
        CallSid: 'CAxxxxx'
      }
    });

    await voicemailHandler(voicemailReq, voicemailRes);

    // Extract callback URL from TwiML
    const twiml = voicemailRes._getData();
    const callbackUrl = parseTwiMLCallbackUrl(twiml, 'Record');

    expect(callbackUrl).toBeTruthy();
    expect(callbackUrl).toContain('/api/twilio/voicemail-callback');

    // Step 2: Simulate Twilio calling the callback
    const callbackHandler = (await import('../../api/twilio/voicemail-callback.js?t=' + Date.now())).default;

    const callbackParams = {
      RecordingSid: 'RE999888777666555444333222111',
      RecordingUrl: 'https://api.twilio.com/recordings/RE999888777666555444333222111',
      RecordingDuration: '120',
      CallSid: 'CAxxxxx',
      From: '+12345678901',
      To: '+19876543210',
      RecordingStatus: 'completed'
    };

    const fullCallbackUrl = `https://miami-theater-voice-agent.vercel.app${new URL(callbackUrl).pathname}`;
    const signature = getExpectedTwilioSignature(
      process.env.TWILIO_AUTH_TOKEN,
      fullCallbackUrl,
      callbackParams
    );

    const { req: callbackReq, res: callbackRes } = createMocks({
      method: 'POST',
      url: new URL(callbackUrl).pathname,
      headers: {
        'x-twilio-signature': signature,
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'miami-theater-voice-agent.vercel.app',
        'content-type': 'application/x-www-form-urlencoded'
      },
      body: callbackParams
    });

    await callbackHandler(callbackReq, callbackRes);

    // Step 3: Verify the complete flow worked
    expect(callbackRes._getStatusCode()).toBe(200);

    // Verify data persisted
    const storedVoicemail = await mockRedis.get(`voicemail:${callbackParams.RecordingSid}`);
    expect(storedVoicemail).toBeTruthy();

    const voicemailData = JSON.parse(storedVoicemail);
    expect(voicemailData.duration).toBe(120);
    expect(voicemailData.from).toBe('+12345678901');

    // Verify email was sent
    expect(emailSendSpy).toHaveBeenCalled();
  });
});

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

// Mock Redis client
class MockRedis {
  constructor() {
    this.data = new Map();
  }

  async get(key) {
    const value = this.data.get(key);
    return value || null;
  }

  async set(key, value) {
    this.data.set(key, value);
    return 'OK';
  }

  clear() {
    this.data.clear();
  }
}

describe('Recording Status Callback (Integration Test)', () => {
  let originalEnv;
  let mockRedis;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };

    // Set test environment
    process.env.BASE_URL = 'https://miami-theater-voice-agent.vercel.app';
    process.env.TWILIO_AUTH_TOKEN = 'test-auth-token-12345';
    process.env.TWILIO_ACCOUNT_SID = 'ACxxxxx';
    process.env.KV_REST_API_URL = 'https://test-redis.upstash.io';
    process.env.KV_REST_API_TOKEN = 'test-token';

    // Create mock Redis instance
    mockRedis = new MockRedis();
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

  test('updates voicemail with recording status information', async () => {
    // Mock Redis
    jest.unstable_mockModule('@upstash/redis', () => ({
      Redis: jest.fn(() => mockRedis)
    }));

    // Pre-populate Redis with a voicemail record
    const recordingSid = 'RE1234567890abcdef1234567890abcdef';
    const existingVoicemail = {
      id: recordingSid,
      recordingUrl: 'https://api.twilio.com/recordings/RE1234567890abcdef1234567890abcdef',
      duration: 45,
      callSid: 'CAxxxxx',
      from: '+12345678901',
      to: '+19876543210',
      status: 'completed',
      createdAt: new Date('2024-01-15T10:30:00Z').toISOString(),
      listened: false
    };

    await mockRedis.set(`voicemail:${recordingSid}`, JSON.stringify(existingVoicemail));

    // Import handler after mocking
    const statusHandler = (await import('../../api/twilio/recording-status.js?t=' + Date.now())).default;

    // Prepare recording status callback data
    const callbackUrl = 'https://miami-theater-voice-agent.vercel.app/api/twilio/recording-status';
    const callbackParams = {
      RecordingSid: recordingSid,
      RecordingUrl: 'https://api.twilio.com/recordings/RE1234567890abcdef1234567890abcdef',
      RecordingStatus: 'completed',
      RecordingDuration: '47',
      RecordingChannels: '1',
      RecordingSource: 'RecordVerb'
    };

    // Generate valid Twilio signature
    const signature = getExpectedTwilioSignature(
      process.env.TWILIO_AUTH_TOKEN,
      callbackUrl,
      callbackParams
    );

    // Create request
    const { req, res } = createMocks({
      method: 'POST',
      url: '/api/twilio/recording-status',
      headers: {
        'x-twilio-signature': signature,
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'miami-theater-voice-agent.vercel.app',
        'content-type': 'application/x-www-form-urlencoded'
      },
      body: callbackParams
    });

    await statusHandler(req, res);

    // Verify response
    expect(res._getStatusCode()).toBe(200);
    const responseData = JSON.parse(res._getData());
    expect(responseData.success).toBe(true);

    // Verify Redis was updated with recording status
    const updatedVoicemail = await mockRedis.get(`voicemail:${recordingSid}`);
    expect(updatedVoicemail).toBeTruthy();

    const voicemailData = JSON.parse(updatedVoicemail);
    expect(voicemailData.recordingStatus).toBe('completed');
    expect(voicemailData.recordingChannels).toBe('1');
    expect(voicemailData.recordingSource).toBe('RecordVerb');
    expect(voicemailData.statusUpdatedAt).toBeTruthy();
    expect(voicemailData.duration).toBe(47); // Updated duration
  });

  test('updates duration when status is completed', async () => {
    // Mock Redis
    jest.unstable_mockModule('@upstash/redis', () => ({
      Redis: jest.fn(() => mockRedis)
    }));

    const recordingSid = 'RE1234567890abcdef1234567890abcdef';
    const existingVoicemail = {
      id: recordingSid,
      recordingUrl: 'https://api.twilio.com/recordings/RE1234567890abcdef1234567890abcdef',
      duration: 0, // Initial duration unknown
      from: '+12345678901',
      createdAt: new Date().toISOString(),
      listened: false
    };

    await mockRedis.set(`voicemail:${recordingSid}`, JSON.stringify(existingVoicemail));

    const statusHandler = (await import('../../api/twilio/recording-status.js?t=' + Date.now())).default;

    const callbackUrl = 'https://miami-theater-voice-agent.vercel.app/api/twilio/recording-status';
    const callbackParams = {
      RecordingSid: recordingSid,
      RecordingUrl: 'https://api.twilio.com/recordings/RE1234567890abcdef1234567890abcdef',
      RecordingStatus: 'completed',
      RecordingDuration: '120'
    };

    const signature = getExpectedTwilioSignature(
      process.env.TWILIO_AUTH_TOKEN,
      callbackUrl,
      callbackParams
    );

    const { req, res } = createMocks({
      method: 'POST',
      url: '/api/twilio/recording-status',
      headers: {
        'x-twilio-signature': signature,
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'miami-theater-voice-agent.vercel.app',
        'content-type': 'application/x-www-form-urlencoded'
      },
      body: callbackParams
    });

    await statusHandler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const updatedVoicemail = await mockRedis.get(`voicemail:${recordingSid}`);
    const voicemailData = JSON.parse(updatedVoicemail);

    // Duration should be updated to 120 seconds
    expect(voicemailData.duration).toBe(120);
    expect(voicemailData.recordingStatus).toBe('completed');
  });

  test('stores error code when recording fails', async () => {
    // Mock Redis
    jest.unstable_mockModule('@upstash/redis', () => ({
      Redis: jest.fn(() => mockRedis)
    }));

    const recordingSid = 'RE1234567890abcdef1234567890abcdef';
    const existingVoicemail = {
      id: recordingSid,
      recordingUrl: 'https://api.twilio.com/recordings/RE1234567890abcdef1234567890abcdef',
      duration: 0,
      from: '+12345678901',
      createdAt: new Date().toISOString(),
      listened: false
    };

    await mockRedis.set(`voicemail:${recordingSid}`, JSON.stringify(existingVoicemail));

    const statusHandler = (await import('../../api/twilio/recording-status.js?t=' + Date.now())).default;

    const callbackUrl = 'https://miami-theater-voice-agent.vercel.app/api/twilio/recording-status';
    const callbackParams = {
      RecordingSid: recordingSid,
      RecordingUrl: 'https://api.twilio.com/recordings/RE1234567890abcdef1234567890abcdef',
      RecordingStatus: 'failed',
      ErrorCode: '13227' // Example Twilio error code
    };

    const signature = getExpectedTwilioSignature(
      process.env.TWILIO_AUTH_TOKEN,
      callbackUrl,
      callbackParams
    );

    const { req, res } = createMocks({
      method: 'POST',
      url: '/api/twilio/recording-status',
      headers: {
        'x-twilio-signature': signature,
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'miami-theater-voice-agent.vercel.app',
        'content-type': 'application/x-www-form-urlencoded'
      },
      body: callbackParams
    });

    await statusHandler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const updatedVoicemail = await mockRedis.get(`voicemail:${recordingSid}`);
    const voicemailData = JSON.parse(updatedVoicemail);

    expect(voicemailData.recordingStatus).toBe('failed');
    expect(voicemailData.errorCode).toBe('13227');
  });

  test('does not update duration when status is not completed', async () => {
    // Mock Redis
    jest.unstable_mockModule('@upstash/redis', () => ({
      Redis: jest.fn(() => mockRedis)
    }));

    const recordingSid = 'RE1234567890abcdef1234567890abcdef';
    const existingVoicemail = {
      id: recordingSid,
      recordingUrl: 'https://api.twilio.com/recordings/RE1234567890abcdef1234567890abcdef',
      duration: 45, // Original duration
      from: '+12345678901',
      createdAt: new Date().toISOString(),
      listened: false
    };

    await mockRedis.set(`voicemail:${recordingSid}`, JSON.stringify(existingVoicemail));

    const statusHandler = (await import('../../api/twilio/recording-status.js?t=' + Date.now())).default;

    const callbackUrl = 'https://miami-theater-voice-agent.vercel.app/api/twilio/recording-status';
    const callbackParams = {
      RecordingSid: recordingSid,
      RecordingUrl: 'https://api.twilio.com/recordings/RE1234567890abcdef1234567890abcdef',
      RecordingStatus: 'processing',
      RecordingDuration: '999' // Should be ignored
    };

    const signature = getExpectedTwilioSignature(
      process.env.TWILIO_AUTH_TOKEN,
      callbackUrl,
      callbackParams
    );

    const { req, res } = createMocks({
      method: 'POST',
      url: '/api/twilio/recording-status',
      headers: {
        'x-twilio-signature': signature,
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'miami-theater-voice-agent.vercel.app',
        'content-type': 'application/x-www-form-urlencoded'
      },
      body: callbackParams
    });

    await statusHandler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const updatedVoicemail = await mockRedis.get(`voicemail:${recordingSid}`);
    const voicemailData = JSON.parse(updatedVoicemail);

    // Duration should remain unchanged
    expect(voicemailData.duration).toBe(45);
    expect(voicemailData.recordingStatus).toBe('processing');
  });

  test('handles missing voicemail record gracefully', async () => {
    // Mock Redis
    jest.unstable_mockModule('@upstash/redis', () => ({
      Redis: jest.fn(() => mockRedis)
    }));

    // Note: We do NOT pre-populate Redis, so the voicemail doesn't exist

    const statusHandler = (await import('../../api/twilio/recording-status.js?t=' + Date.now())).default;

    const callbackUrl = 'https://miami-theater-voice-agent.vercel.app/api/twilio/recording-status';
    const callbackParams = {
      RecordingSid: 'RE_DOES_NOT_EXIST',
      RecordingUrl: 'https://api.twilio.com/recordings/RE_DOES_NOT_EXIST',
      RecordingStatus: 'completed',
      RecordingDuration: '60'
    };

    const signature = getExpectedTwilioSignature(
      process.env.TWILIO_AUTH_TOKEN,
      callbackUrl,
      callbackParams
    );

    const { req, res } = createMocks({
      method: 'POST',
      url: '/api/twilio/recording-status',
      headers: {
        'x-twilio-signature': signature,
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'miami-theater-voice-agent.vercel.app',
        'content-type': 'application/x-www-form-urlencoded'
      },
      body: callbackParams
    });

    await statusHandler(req, res);

    // Should still return 200 (graceful handling)
    expect(res._getStatusCode()).toBe(200);
    const responseData = JSON.parse(res._getData());
    expect(responseData.success).toBe(true);
  });

  test('rejects invalid Twilio signature', async () => {
    // Mock Redis
    jest.unstable_mockModule('@upstash/redis', () => ({
      Redis: jest.fn(() => mockRedis)
    }));

    const statusHandler = (await import('../../api/twilio/recording-status.js?t=' + Date.now())).default;

    const callbackParams = {
      RecordingSid: 'RE1234567890abcdef1234567890abcdef',
      RecordingUrl: 'https://api.twilio.com/recordings/RE1234567890abcdef1234567890abcdef',
      RecordingStatus: 'completed',
      RecordingDuration: '60'
    };

    // Create request with INVALID signature
    const { req, res } = createMocks({
      method: 'POST',
      url: '/api/twilio/recording-status',
      headers: {
        'x-twilio-signature': 'invalid-signature-xyz',
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'miami-theater-voice-agent.vercel.app',
        'content-type': 'application/x-www-form-urlencoded'
      },
      body: callbackParams
    });

    await statusHandler(req, res);

    // Should return 403 Forbidden
    expect(res._getStatusCode()).toBe(403);
    const responseData = JSON.parse(res._getData());
    expect(responseData.error).toContain('Invalid signature');
  });

  test('rejects non-POST requests', async () => {
    const statusHandler = (await import('../../api/twilio/recording-status.js?t=' + Date.now())).default;

    const { req, res } = createMocks({
      method: 'GET'
    });

    await statusHandler(req, res);

    expect(res._getStatusCode()).toBe(405);
    const responseData = JSON.parse(res._getData());
    expect(responseData.error).toBe('Method not allowed');
  });

  test('returns 500 when TWILIO_AUTH_TOKEN is not configured', async () => {
    // Remove auth token
    delete process.env.TWILIO_AUTH_TOKEN;

    const statusHandler = (await import('../../api/twilio/recording-status.js?t=' + Date.now())).default;

    const { req, res } = createMocks({
      method: 'POST',
      headers: {
        'x-twilio-signature': 'some-signature'
      },
      body: {}
    });

    await statusHandler(req, res);

    expect(res._getStatusCode()).toBe(500);
    const responseData = JSON.parse(res._getData());
    expect(responseData.error).toBe('Server configuration error');
  });

  test('handles recording with all status fields', async () => {
    // Mock Redis
    jest.unstable_mockModule('@upstash/redis', () => ({
      Redis: jest.fn(() => mockRedis)
    }));

    const recordingSid = 'RE1234567890abcdef1234567890abcdef';
    const existingVoicemail = {
      id: recordingSid,
      recordingUrl: 'https://api.twilio.com/recordings/RE1234567890abcdef1234567890abcdef',
      duration: 45,
      from: '+12345678901',
      createdAt: new Date().toISOString(),
      listened: false
    };

    await mockRedis.set(`voicemail:${recordingSid}`, JSON.stringify(existingVoicemail));

    const statusHandler = (await import('../../api/twilio/recording-status.js?t=' + Date.now())).default;

    const callbackUrl = 'https://miami-theater-voice-agent.vercel.app/api/twilio/recording-status';
    const callbackParams = {
      RecordingSid: recordingSid,
      RecordingUrl: 'https://api.twilio.com/recordings/RE1234567890abcdef1234567890abcdef',
      RecordingStatus: 'completed',
      RecordingDuration: '55',
      RecordingChannels: '2',
      RecordingSource: 'StartCallRecordingAPI'
    };

    const signature = getExpectedTwilioSignature(
      process.env.TWILIO_AUTH_TOKEN,
      callbackUrl,
      callbackParams
    );

    const { req, res } = createMocks({
      method: 'POST',
      url: '/api/twilio/recording-status',
      headers: {
        'x-twilio-signature': signature,
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'miami-theater-voice-agent.vercel.app',
        'content-type': 'application/x-www-form-urlencoded'
      },
      body: callbackParams
    });

    await statusHandler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const updatedVoicemail = await mockRedis.get(`voicemail:${recordingSid}`);
    const voicemailData = JSON.parse(updatedVoicemail);

    expect(voicemailData.recordingStatus).toBe('completed');
    expect(voicemailData.recordingChannels).toBe('2');
    expect(voicemailData.recordingSource).toBe('StartCallRecordingAPI');
    expect(voicemailData.duration).toBe(55);
    expect(voicemailData.statusUpdatedAt).toBeTruthy();
    expect(new Date(voicemailData.statusUpdatedAt).getTime()).toBeGreaterThan(0);
  });
});

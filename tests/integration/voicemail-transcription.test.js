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

describe('Voicemail Transcription Callback (Integration Test)', () => {
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
    emailSendSpy = jest.fn().mockResolvedValue({ id: 'email-456' });
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

  test('updates voicemail with transcription when callback is received', async () => {
    // Mock dependencies
    jest.unstable_mockModule('@upstash/redis', () => ({
      Redis: jest.fn(() => mockRedis)
    }));
    jest.unstable_mockModule('../../api/utils/voicemail-email.js', () => ({
      sendVoicemailEmail: emailSendSpy
    }));

    // Pre-populate Redis with a voicemail record (as if callback already created it)
    const recordingSid = 'RE1234567890abcdef1234567890abcdef';
    const existingVoicemail = {
      id: recordingSid,
      recordingUrl: 'https://api.twilio.com/recordings/RE1234567890abcdef1234567890abcdef',
      duration: 45,
      callSid: 'CAxxxxx',
      from: '+12345678901',
      to: '+19876543210',
      status: 'completed',
      transcription: null,
      createdAt: new Date('2024-01-15T10:30:00Z').toISOString(),
      listened: false
    };

    await mockRedis.set(`voicemail:${recordingSid}`, JSON.stringify(existingVoicemail));

    // Import handler after mocking
    const transcriptionHandler = (await import('../../api/twilio/voicemail-transcription.js?t=' + Date.now())).default;

    // Prepare transcription callback data (what Twilio sends)
    const callbackUrl = 'https://miami-theater-voice-agent.vercel.app/api/twilio/voicemail-transcription';
    const callbackParams = {
      TranscriptionSid: 'TR9876543210fedcba9876543210fedcba',
      TranscriptionText: 'Hello, I would like to know what movies are playing this weekend. Thank you.',
      TranscriptionStatus: 'completed',
      RecordingSid: recordingSid,
      TranscriptionUrl: 'https://api.twilio.com/transcriptions/TR9876543210fedcba9876543210fedcba'
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
      url: '/api/twilio/voicemail-transcription',
      headers: {
        'x-twilio-signature': signature,
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'miami-theater-voice-agent.vercel.app',
        'content-type': 'application/x-www-form-urlencoded'
      },
      body: callbackParams
    });

    await transcriptionHandler(req, res);

    // Verify response
    expect(res._getStatusCode()).toBe(200);
    const responseData = JSON.parse(res._getData());
    expect(responseData.success).toBe(true);

    // Verify Redis was updated with transcription
    const updatedVoicemail = await mockRedis.get(`voicemail:${recordingSid}`);
    expect(updatedVoicemail).toBeTruthy();

    const voicemailData = JSON.parse(updatedVoicemail);
    expect(voicemailData.transcription).toBe(callbackParams.TranscriptionText);
    expect(voicemailData.transcriptionSid).toBe(callbackParams.TranscriptionSid);
    expect(voicemailData.transcriptionUrl).toBe(callbackParams.TranscriptionUrl);
    expect(voicemailData.transcriptionUpdatedAt).toBeTruthy();

    // Verify email notification was sent
    expect(emailSendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        transcription: callbackParams.TranscriptionText,
        transcriptionSid: callbackParams.TranscriptionSid
      }),
      'transcription'
    );
  });

  test('rejects invalid Twilio signature', async () => {
    // Mock dependencies
    jest.unstable_mockModule('@upstash/redis', () => ({
      Redis: jest.fn(() => mockRedis)
    }));

    const transcriptionHandler = (await import('../../api/twilio/voicemail-transcription.js?t=' + Date.now())).default;

    const callbackParams = {
      TranscriptionSid: 'TR9876543210fedcba9876543210fedcba',
      TranscriptionText: 'This is a test transcription.',
      TranscriptionStatus: 'completed',
      RecordingSid: 'RE1234567890abcdef1234567890abcdef',
      TranscriptionUrl: 'https://api.twilio.com/transcriptions/TR9876543210fedcba9876543210fedcba'
    };

    // Create request with INVALID signature
    const { req, res } = createMocks({
      method: 'POST',
      url: '/api/twilio/voicemail-transcription',
      headers: {
        'x-twilio-signature': 'invalid-signature-xyz',
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'miami-theater-voice-agent.vercel.app',
        'content-type': 'application/x-www-form-urlencoded'
      },
      body: callbackParams
    });

    await transcriptionHandler(req, res);

    // Should return 403 Forbidden
    expect(res._getStatusCode()).toBe(403);
    const responseData = JSON.parse(res._getData());
    expect(responseData.error).toContain('Invalid signature');
  });

  test('handles missing voicemail record gracefully', async () => {
    // Mock dependencies
    jest.unstable_mockModule('@upstash/redis', () => ({
      Redis: jest.fn(() => mockRedis)
    }));
    jest.unstable_mockModule('../../api/utils/voicemail-email.js', () => ({
      sendVoicemailEmail: emailSendSpy
    }));

    // Note: We do NOT pre-populate Redis, so the voicemail doesn't exist

    const transcriptionHandler = (await import('../../api/twilio/voicemail-transcription.js?t=' + Date.now())).default;

    const callbackUrl = 'https://miami-theater-voice-agent.vercel.app/api/twilio/voicemail-transcription';
    const callbackParams = {
      TranscriptionSid: 'TR9876543210fedcba9876543210fedcba',
      TranscriptionText: 'This transcription has no matching voicemail.',
      TranscriptionStatus: 'completed',
      RecordingSid: 'RE_DOES_NOT_EXIST',
      TranscriptionUrl: 'https://api.twilio.com/transcriptions/TR9876543210fedcba9876543210fedcba'
    };

    const signature = getExpectedTwilioSignature(
      process.env.TWILIO_AUTH_TOKEN,
      callbackUrl,
      callbackParams
    );

    const { req, res } = createMocks({
      method: 'POST',
      url: '/api/twilio/voicemail-transcription',
      headers: {
        'x-twilio-signature': signature,
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'miami-theater-voice-agent.vercel.app',
        'content-type': 'application/x-www-form-urlencoded'
      },
      body: callbackParams
    });

    await transcriptionHandler(req, res);

    // Should still return 200 (graceful handling)
    expect(res._getStatusCode()).toBe(200);
    const responseData = JSON.parse(res._getData());
    expect(responseData.success).toBe(true);

    // Email should NOT have been sent (no voicemail to send about)
    expect(emailSendSpy).not.toHaveBeenCalled();
  });

  test('skips transcription update when status is not completed', async () => {
    // Mock dependencies
    jest.unstable_mockModule('@upstash/redis', () => ({
      Redis: jest.fn(() => mockRedis)
    }));
    jest.unstable_mockModule('../../api/utils/voicemail-email.js', () => ({
      sendVoicemailEmail: emailSendSpy
    }));

    const recordingSid = 'RE1234567890abcdef1234567890abcdef';
    const existingVoicemail = {
      id: recordingSid,
      recordingUrl: 'https://api.twilio.com/recordings/RE1234567890abcdef1234567890abcdef',
      duration: 45,
      from: '+12345678901',
      transcription: null,
      createdAt: new Date().toISOString(),
      listened: false
    };

    await mockRedis.set(`voicemail:${recordingSid}`, JSON.stringify(existingVoicemail));

    const transcriptionHandler = (await import('../../api/twilio/voicemail-transcription.js?t=' + Date.now())).default;

    const callbackUrl = 'https://miami-theater-voice-agent.vercel.app/api/twilio/voicemail-transcription';
    const callbackParams = {
      TranscriptionSid: 'TR9876543210fedcba9876543210fedcba',
      TranscriptionText: '',
      TranscriptionStatus: 'failed', // NOT completed
      RecordingSid: recordingSid,
      TranscriptionUrl: 'https://api.twilio.com/transcriptions/TR9876543210fedcba9876543210fedcba'
    };

    const signature = getExpectedTwilioSignature(
      process.env.TWILIO_AUTH_TOKEN,
      callbackUrl,
      callbackParams
    );

    const { req, res } = createMocks({
      method: 'POST',
      url: '/api/twilio/voicemail-transcription',
      headers: {
        'x-twilio-signature': signature,
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'miami-theater-voice-agent.vercel.app',
        'content-type': 'application/x-www-form-urlencoded'
      },
      body: callbackParams
    });

    await transcriptionHandler(req, res);

    // Should return 200
    expect(res._getStatusCode()).toBe(200);

    // Voicemail should NOT be updated (transcription still null)
    const voicemailAfter = await mockRedis.get(`voicemail:${recordingSid}`);
    const voicemailData = JSON.parse(voicemailAfter);
    expect(voicemailData.transcription).toBeNull();
    expect(voicemailData.transcriptionSid).toBeUndefined();

    // No email sent
    expect(emailSendSpy).not.toHaveBeenCalled();
  });

  test('handles empty transcription text gracefully', async () => {
    // Mock dependencies
    jest.unstable_mockModule('@upstash/redis', () => ({
      Redis: jest.fn(() => mockRedis)
    }));
    jest.unstable_mockModule('../../api/utils/voicemail-email.js', () => ({
      sendVoicemailEmail: emailSendSpy
    }));

    const recordingSid = 'RE1234567890abcdef1234567890abcdef';
    const existingVoicemail = {
      id: recordingSid,
      recordingUrl: 'https://api.twilio.com/recordings/RE1234567890abcdef1234567890abcdef',
      duration: 45,
      from: '+12345678901',
      transcription: null,
      createdAt: new Date().toISOString(),
      listened: false
    };

    await mockRedis.set(`voicemail:${recordingSid}`, JSON.stringify(existingVoicemail));

    const transcriptionHandler = (await import('../../api/twilio/voicemail-transcription.js?t=' + Date.now())).default;

    const callbackUrl = 'https://miami-theater-voice-agent.vercel.app/api/twilio/voicemail-transcription';
    const callbackParams = {
      TranscriptionSid: 'TR9876543210fedcba9876543210fedcba',
      TranscriptionText: '', // Empty transcription
      TranscriptionStatus: 'completed',
      RecordingSid: recordingSid,
      TranscriptionUrl: 'https://api.twilio.com/transcriptions/TR9876543210fedcba9876543210fedcba'
    };

    const signature = getExpectedTwilioSignature(
      process.env.TWILIO_AUTH_TOKEN,
      callbackUrl,
      callbackParams
    );

    const { req, res } = createMocks({
      method: 'POST',
      url: '/api/twilio/voicemail-transcription',
      headers: {
        'x-twilio-signature': signature,
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'miami-theater-voice-agent.vercel.app',
        'content-type': 'application/x-www-form-urlencoded'
      },
      body: callbackParams
    });

    await transcriptionHandler(req, res);

    // Should return 200
    expect(res._getStatusCode()).toBe(200);

    // Voicemail should be updated with empty transcription
    const voicemailAfter = await mockRedis.get(`voicemail:${recordingSid}`);
    const voicemailData = JSON.parse(voicemailAfter);
    expect(voicemailData.transcription).toBe('');
    expect(voicemailData.transcriptionSid).toBe(callbackParams.TranscriptionSid);

    // Email should NOT be sent (empty transcription text)
    expect(emailSendSpy).not.toHaveBeenCalled();
  });

  test('rejects non-POST requests', async () => {
    const transcriptionHandler = (await import('../../api/twilio/voicemail-transcription.js?t=' + Date.now())).default;

    const { req, res } = createMocks({
      method: 'GET'
    });

    await transcriptionHandler(req, res);

    expect(res._getStatusCode()).toBe(405);
    const responseData = JSON.parse(res._getData());
    expect(responseData.error).toBe('Method not allowed');
  });

  test('returns 500 when TWILIO_AUTH_TOKEN is not configured', async () => {
    // Remove auth token
    delete process.env.TWILIO_AUTH_TOKEN;

    const transcriptionHandler = (await import('../../api/twilio/voicemail-transcription.js?t=' + Date.now())).default;

    const { req, res } = createMocks({
      method: 'POST',
      headers: {
        'x-twilio-signature': 'some-signature'
      },
      body: {}
    });

    await transcriptionHandler(req, res);

    expect(res._getStatusCode()).toBe(500);
    const responseData = JSON.parse(res._getData());
    expect(responseData.error).toBe('Server configuration error');
  });
});

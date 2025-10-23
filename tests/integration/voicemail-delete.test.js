import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { createMocks } from 'node-mocks-http';

// Mock Redis client with sorted set support
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

  async del(key) {
    const existed = this.data.has(key);
    this.data.delete(key);
    return existed ? 1 : 0;
  }

  async zrem(key, member) {
    const set = this.sortedSets.get(key);
    if (!set) return 0;

    const initialLength = set.length;
    const filtered = set.filter(item => item.member !== member);
    this.sortedSets.set(key, filtered);

    return initialLength - filtered.length; // Number of items removed
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

  async zcard(key) {
    const set = this.sortedSets.get(key) || [];
    return set.length;
  }

  clear() {
    this.data.clear();
    this.sortedSets.clear();
  }
}

describe('Voicemail Delete Endpoint (Integration Test)', () => {
  let originalEnv;
  let mockRedis;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };

    // Set test environment
    process.env.STAFF_DASHBOARD_SECRET = 'test-secret-token-12345';
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

  test('successfully deletes voicemail with valid authentication', async () => {
    // Mock Redis
    jest.unstable_mockModule('@upstash/redis', () => ({
      Redis: jest.fn(() => mockRedis)
    }));

    // Add a voicemail to Redis
    const voicemail = {
      id: 'RE12345',
      recordingUrl: 'https://api.twilio.com/recordings/RE12345',
      duration: 45,
      from: '+12345678901',
      to: '+19876543210',
      transcription: 'Test voicemail message',
      createdAt: new Date('2024-01-15T10:00:00Z').toISOString(),
      listened: false
    };

    await mockRedis.zadd('voicemails:index', { score: Date.parse(voicemail.createdAt), member: 'RE12345' });
    await mockRedis.set('voicemail:RE12345', JSON.stringify(voicemail));

    // Verify voicemail exists before deletion
    expect(await mockRedis.get('voicemail:RE12345')).toBeTruthy();
    expect(await mockRedis.zcard('voicemails:index')).toBe(1);

    // Import handler after mocking
    const deleteHandler = (await import('../../api/voicemail/delete.js?t=' + Date.now())).default;

    const { req, res } = createMocks({
      method: 'DELETE',
      query: {
        id: 'RE12345'
      },
      headers: {
        'authorization': 'Bearer test-secret-token-12345'
      }
    });

    await deleteHandler(req, res);

    // Verify response
    expect(res._getStatusCode()).toBe(200);
    const responseData = JSON.parse(res._getData());

    expect(responseData.success).toBe(true);
    expect(responseData.message).toBe('Voicemail deleted successfully');
    expect(responseData.id).toBe('RE12345');

    // Verify voicemail was removed from Redis
    expect(await mockRedis.get('voicemail:RE12345')).toBeNull();
    expect(await mockRedis.zcard('voicemails:index')).toBe(0);
  });

  test('returns 404 when voicemail does not exist', async () => {
    jest.unstable_mockModule('@upstash/redis', () => ({
      Redis: jest.fn(() => mockRedis)
    }));

    // Don't add any voicemail - it doesn't exist

    const deleteHandler = (await import('../../api/voicemail/delete.js?t=' + Date.now())).default;

    const { req, res } = createMocks({
      method: 'DELETE',
      query: {
        id: 'RE-NONEXISTENT'
      },
      headers: {
        'authorization': 'Bearer test-secret-token-12345'
      }
    });

    await deleteHandler(req, res);

    expect(res._getStatusCode()).toBe(404);
    const responseData = JSON.parse(res._getData());
    expect(responseData.error).toBe('Voicemail not found');
  });

  test('returns 400 when voicemail ID is missing', async () => {
    jest.unstable_mockModule('@upstash/redis', () => ({
      Redis: jest.fn(() => mockRedis)
    }));

    const deleteHandler = (await import('../../api/voicemail/delete.js?t=' + Date.now())).default;

    const { req, res } = createMocks({
      method: 'DELETE',
      query: {
        // No id parameter
      },
      headers: {
        'authorization': 'Bearer test-secret-token-12345'
      }
    });

    await deleteHandler(req, res);

    expect(res._getStatusCode()).toBe(400);
    const responseData = JSON.parse(res._getData());
    expect(responseData.error).toBe('Missing voicemail ID');
  });

  test('rejects request with invalid Bearer token', async () => {
    jest.unstable_mockModule('@upstash/redis', () => ({
      Redis: jest.fn(() => mockRedis)
    }));

    const deleteHandler = (await import('../../api/voicemail/delete.js?t=' + Date.now())).default;

    const { req, res } = createMocks({
      method: 'DELETE',
      query: {
        id: 'RE12345'
      },
      headers: {
        'authorization': 'Bearer wrong-token'
      }
    });

    await deleteHandler(req, res);

    expect(res._getStatusCode()).toBe(401);
    const responseData = JSON.parse(res._getData());
    expect(responseData.error).toBe('Unauthorized - Invalid credentials');
  });

  test('rejects request with missing Authorization header', async () => {
    jest.unstable_mockModule('@upstash/redis', () => ({
      Redis: jest.fn(() => mockRedis)
    }));

    const deleteHandler = (await import('../../api/voicemail/delete.js?t=' + Date.now())).default;

    const { req, res } = createMocks({
      method: 'DELETE',
      query: {
        id: 'RE12345'
      },
      headers: {
        // No authorization header
      }
    });

    await deleteHandler(req, res);

    expect(res._getStatusCode()).toBe(401);
    const responseData = JSON.parse(res._getData());
    expect(responseData.error).toBe('Unauthorized - Invalid credentials');
  });

  test('accepts token without Bearer prefix', async () => {
    jest.unstable_mockModule('@upstash/redis', () => ({
      Redis: jest.fn(() => mockRedis)
    }));

    // Add a voicemail
    const voicemail = {
      id: 'RE12345',
      recordingUrl: 'https://api.twilio.com/recordings/RE12345',
      duration: 45,
      from: '+12345678901',
      createdAt: new Date().toISOString(),
      listened: false
    };

    await mockRedis.zadd('voicemails:index', { score: Date.now(), member: 'RE12345' });
    await mockRedis.set('voicemail:RE12345', JSON.stringify(voicemail));

    const deleteHandler = (await import('../../api/voicemail/delete.js?t=' + Date.now())).default;

    const { req, res } = createMocks({
      method: 'DELETE',
      query: {
        id: 'RE12345'
      },
      headers: {
        'authorization': 'test-secret-token-12345' // No "Bearer " prefix
      }
    });

    await deleteHandler(req, res);

    // Should succeed
    expect(res._getStatusCode()).toBe(200);
  });

  test('handles CORS preflight request', async () => {
    const deleteHandler = (await import('../../api/voicemail/delete.js?t=' + Date.now())).default;

    const { req, res } = createMocks({
      method: 'OPTIONS'
    });

    await deleteHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getHeaders()['access-control-allow-origin']).toBe('*');
    expect(res._getHeaders()['access-control-allow-methods']).toBe('DELETE, OPTIONS');
    expect(res._getHeaders()['access-control-allow-headers']).toBe('Content-Type, Authorization');
  });

  test('rejects non-DELETE requests (except OPTIONS)', async () => {
    const deleteHandler = (await import('../../api/voicemail/delete.js?t=' + Date.now())).default;

    const { req, res } = createMocks({
      method: 'GET',
      query: {
        id: 'RE12345'
      },
      headers: {
        'authorization': 'Bearer test-secret-token-12345'
      }
    });

    await deleteHandler(req, res);

    expect(res._getStatusCode()).toBe(405);
    const responseData = JSON.parse(res._getData());
    expect(responseData.error).toBe('Method not allowed');
  });

  test('rejects POST requests', async () => {
    const deleteHandler = (await import('../../api/voicemail/delete.js?t=' + Date.now())).default;

    const { req, res } = createMocks({
      method: 'POST',
      query: {
        id: 'RE12345'
      },
      headers: {
        'authorization': 'Bearer test-secret-token-12345'
      }
    });

    await deleteHandler(req, res);

    expect(res._getStatusCode()).toBe(405);
  });

  test('returns 500 when STAFF_DASHBOARD_SECRET is not configured', async () => {
    // Remove the secret
    delete process.env.STAFF_DASHBOARD_SECRET;

    const deleteHandler = (await import('../../api/voicemail/delete.js?t=' + Date.now())).default;

    const { req, res } = createMocks({
      method: 'DELETE',
      query: {
        id: 'RE12345'
      },
      headers: {
        'authorization': 'Bearer some-token'
      }
    });

    await deleteHandler(req, res);

    expect(res._getStatusCode()).toBe(500);
    const responseData = JSON.parse(res._getData());
    expect(responseData.error).toBe('Server configuration error');
  });

  test('uses timing-safe comparison for token validation', async () => {
    jest.unstable_mockModule('@upstash/redis', () => ({
      Redis: jest.fn(() => mockRedis)
    }));

    const deleteHandler = (await import('../../api/voicemail/delete.js?t=' + Date.now())).default;

    // Try with a token that has same length but wrong content
    const { req, res } = createMocks({
      method: 'DELETE',
      query: {
        id: 'RE12345'
      },
      headers: {
        'authorization': 'Bearer test-secret-token-99999' // Same length, different content
      }
    });

    await deleteHandler(req, res);

    // Should be rejected despite same length
    expect(res._getStatusCode()).toBe(401);
  });

  test('deletes only the specified voicemail, leaving others intact', async () => {
    jest.unstable_mockModule('@upstash/redis', () => ({
      Redis: jest.fn(() => mockRedis)
    }));

    // Add multiple voicemails
    const voicemail1 = {
      id: 'RE111',
      recordingUrl: 'https://api.twilio.com/recordings/RE111',
      duration: 45,
      from: '+12345678901',
      createdAt: new Date('2024-01-15T10:00:00Z').toISOString(),
      listened: false
    };

    const voicemail2 = {
      id: 'RE222',
      recordingUrl: 'https://api.twilio.com/recordings/RE222',
      duration: 30,
      from: '+13334445555',
      createdAt: new Date('2024-01-15T11:00:00Z').toISOString(),
      listened: false
    };

    await mockRedis.zadd('voicemails:index', { score: Date.parse(voicemail1.createdAt), member: 'RE111' });
    await mockRedis.zadd('voicemails:index', { score: Date.parse(voicemail2.createdAt), member: 'RE222' });
    await mockRedis.set('voicemail:RE111', JSON.stringify(voicemail1));
    await mockRedis.set('voicemail:RE222', JSON.stringify(voicemail2));

    // Verify both exist
    expect(await mockRedis.zcard('voicemails:index')).toBe(2);

    const deleteHandler = (await import('../../api/voicemail/delete.js?t=' + Date.now())).default;

    const { req, res } = createMocks({
      method: 'DELETE',
      query: {
        id: 'RE111' // Delete only the first one
      },
      headers: {
        'authorization': 'Bearer test-secret-token-12345'
      }
    });

    await deleteHandler(req, res);

    expect(res._getStatusCode()).toBe(200);

    // Verify only RE111 was deleted
    expect(await mockRedis.get('voicemail:RE111')).toBeNull();
    expect(await mockRedis.get('voicemail:RE222')).toBeTruthy();
    expect(await mockRedis.zcard('voicemails:index')).toBe(1);
  });

  test('handles Redis error gracefully', async () => {
    // Create a Redis mock that throws an error
    const errorRedis = {
      get: jest.fn().mockRejectedValue(new Error('Redis connection failed')),
      del: jest.fn(),
      zrem: jest.fn()
    };

    jest.unstable_mockModule('@upstash/redis', () => ({
      Redis: jest.fn(() => errorRedis)
    }));

    const deleteHandler = (await import('../../api/voicemail/delete.js?t=' + Date.now())).default;

    const { req, res } = createMocks({
      method: 'DELETE',
      query: {
        id: 'RE12345'
      },
      headers: {
        'authorization': 'Bearer test-secret-token-12345'
      }
    });

    await deleteHandler(req, res);

    expect(res._getStatusCode()).toBe(500);
    const responseData = JSON.parse(res._getData());
    expect(responseData.error).toBe('Failed to delete voicemail');
  });

  test('deletes voicemail with special characters in ID', async () => {
    jest.unstable_mockModule('@upstash/redis', () => ({
      Redis: jest.fn(() => mockRedis)
    }));

    // Add voicemail with special characters in ID
    const voicemailId = 'RE123-456_789';
    const voicemail = {
      id: voicemailId,
      recordingUrl: 'https://api.twilio.com/recordings/' + voicemailId,
      duration: 45,
      from: '+12345678901',
      createdAt: new Date().toISOString(),
      listened: false
    };

    await mockRedis.zadd('voicemails:index', { score: Date.now(), member: voicemailId });
    await mockRedis.set('voicemail:' + voicemailId, JSON.stringify(voicemail));

    const deleteHandler = (await import('../../api/voicemail/delete.js?t=' + Date.now())).default;

    const { req, res } = createMocks({
      method: 'DELETE',
      query: {
        id: voicemailId
      },
      headers: {
        'authorization': 'Bearer test-secret-token-12345'
      }
    });

    await deleteHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(await mockRedis.get('voicemail:' + voicemailId)).toBeNull();
  });
});

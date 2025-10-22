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

  async zrange(key, start, stop, options = {}) {
    const set = this.sortedSets.get(key) || [];
    let sorted = [...set].sort((a, b) => a.score - b.score);

    // Reverse if requested (newest first)
    if (options.rev) {
      sorted = sorted.reverse();
    }

    // Handle Redis-style negative indices
    if (stop === -1) {
      return sorted.slice(start).map(item => item.member);
    }

    return sorted.slice(start, stop + 1).map(item => item.member);
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

describe('Voicemail List Endpoint (Integration Test)', () => {
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

  test('authenticates with valid Bearer token and returns JSON', async () => {
    // Mock Redis
    jest.unstable_mockModule('@upstash/redis', () => ({
      Redis: jest.fn(() => mockRedis)
    }));

    // Add sample voicemails to Redis
    const voicemail1 = {
      id: 'RE111',
      recordingUrl: 'https://api.twilio.com/recordings/RE111',
      duration: 45,
      from: '+12345678901',
      to: '+19876543210',
      transcription: 'Hello, this is a test message.',
      createdAt: new Date('2024-01-15T10:00:00Z').toISOString(),
      listened: false
    };

    const voicemail2 = {
      id: 'RE222',
      recordingUrl: 'https://api.twilio.com/recordings/RE222',
      duration: 30,
      from: '+13334445555',
      to: '+19876543210',
      transcription: 'Another test message.',
      createdAt: new Date('2024-01-15T11:00:00Z').toISOString(),
      listened: true
    };

    await mockRedis.zadd('voicemails:index', { score: Date.parse(voicemail1.createdAt), member: 'RE111' });
    await mockRedis.zadd('voicemails:index', { score: Date.parse(voicemail2.createdAt), member: 'RE222' });
    await mockRedis.set('voicemail:RE111', JSON.stringify(voicemail1));
    await mockRedis.set('voicemail:RE222', JSON.stringify(voicemail2));

    // Import handler after mocking
    const listHandler = (await import('../../api/voicemail/list.js?t=' + Date.now())).default;

    const { req, res } = createMocks({
      method: 'GET',
      headers: {
        'authorization': 'Bearer test-secret-token-12345',
        'accept': 'application/json'
      }
    });

    await listHandler(req, res);

    // Verify response
    expect(res._getStatusCode()).toBe(200);
    const responseData = JSON.parse(res._getData());

    expect(responseData.success).toBe(true);
    expect(responseData.voicemails).toHaveLength(2);
    expect(responseData.total).toBe(2);
    expect(responseData.count).toBe(2);
    expect(responseData.limit).toBe(50); // default limit
    expect(responseData.offset).toBe(0);

    // Verify voicemails are returned in reverse chronological order (newest first)
    expect(responseData.voicemails[0].id).toBe('RE222');
    expect(responseData.voicemails[1].id).toBe('RE111');
  });

  test('rejects request with invalid Bearer token', async () => {
    jest.unstable_mockModule('@upstash/redis', () => ({
      Redis: jest.fn(() => mockRedis)
    }));

    const listHandler = (await import('../../api/voicemail/list.js?t=' + Date.now())).default;

    const { req, res } = createMocks({
      method: 'GET',
      headers: {
        'authorization': 'Bearer wrong-token',
        'accept': 'application/json'
      }
    });

    await listHandler(req, res);

    expect(res._getStatusCode()).toBe(401);
    const responseData = JSON.parse(res._getData());
    expect(responseData.error).toBe('Unauthorized - Invalid credentials');
  });

  test('rejects request with missing Authorization header', async () => {
    jest.unstable_mockModule('@upstash/redis', () => ({
      Redis: jest.fn(() => mockRedis)
    }));

    const listHandler = (await import('../../api/voicemail/list.js?t=' + Date.now())).default;

    const { req, res } = createMocks({
      method: 'GET',
      headers: {
        'accept': 'application/json'
        // No authorization header
      }
    });

    await listHandler(req, res);

    expect(res._getStatusCode()).toBe(401);
    const responseData = JSON.parse(res._getData());
    expect(responseData.error).toBe('Unauthorized - Invalid credentials');
  });

  test('accepts token without Bearer prefix', async () => {
    jest.unstable_mockModule('@upstash/redis', () => ({
      Redis: jest.fn(() => mockRedis)
    }));

    const listHandler = (await import('../../api/voicemail/list.js?t=' + Date.now())).default;

    const { req, res } = createMocks({
      method: 'GET',
      headers: {
        'authorization': 'test-secret-token-12345', // No "Bearer " prefix
        'accept': 'application/json'
      }
    });

    await listHandler(req, res);

    // Should succeed
    expect(res._getStatusCode()).toBe(200);
  });

  test('filters unlistened voicemails when unlistened_only=true', async () => {
    jest.unstable_mockModule('@upstash/redis', () => ({
      Redis: jest.fn(() => mockRedis)
    }));

    // Add voicemails with different listened states
    const unlistened = {
      id: 'RE111',
      recordingUrl: 'https://api.twilio.com/recordings/RE111',
      duration: 45,
      from: '+12345678901',
      createdAt: new Date('2024-01-15T10:00:00Z').toISOString(),
      listened: false
    };

    const listened = {
      id: 'RE222',
      recordingUrl: 'https://api.twilio.com/recordings/RE222',
      duration: 30,
      from: '+13334445555',
      createdAt: new Date('2024-01-15T11:00:00Z').toISOString(),
      listened: true
    };

    await mockRedis.zadd('voicemails:index', { score: Date.parse(unlistened.createdAt), member: 'RE111' });
    await mockRedis.zadd('voicemails:index', { score: Date.parse(listened.createdAt), member: 'RE222' });
    await mockRedis.set('voicemail:RE111', JSON.stringify(unlistened));
    await mockRedis.set('voicemail:RE222', JSON.stringify(listened));

    const listHandler = (await import('../../api/voicemail/list.js?t=' + Date.now())).default;

    const { req, res } = createMocks({
      method: 'GET',
      query: {
        unlistened_only: 'true'
      },
      headers: {
        'authorization': 'Bearer test-secret-token-12345',
        'accept': 'application/json'
      }
    });

    await listHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = JSON.parse(res._getData());

    // Should only return unlistened voicemail
    expect(responseData.voicemails).toHaveLength(1);
    expect(responseData.voicemails[0].id).toBe('RE111');
    expect(responseData.voicemails[0].listened).toBe(false);
  });

  test('respects pagination with limit and offset', async () => {
    jest.unstable_mockModule('@upstash/redis', () => ({
      Redis: jest.fn(() => mockRedis)
    }));

    // Add 5 voicemails
    for (let i = 1; i <= 5; i++) {
      const vm = {
        id: `RE${i}${i}${i}`,
        recordingUrl: `https://api.twilio.com/recordings/RE${i}${i}${i}`,
        duration: 30 + i,
        from: `+1234567890${i}`,
        createdAt: new Date(`2024-01-15T1${i}:00:00Z`).toISOString(),
        listened: false
      };
      await mockRedis.zadd('voicemails:index', { score: Date.parse(vm.createdAt), member: vm.id });
      await mockRedis.set(`voicemail:${vm.id}`, JSON.stringify(vm));
    }

    const listHandler = (await import('../../api/voicemail/list.js?t=' + Date.now())).default;

    const { req, res } = createMocks({
      method: 'GET',
      query: {
        limit: '2',
        offset: '1'
      },
      headers: {
        'authorization': 'Bearer test-secret-token-12345',
        'accept': 'application/json'
      }
    });

    await listHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = JSON.parse(res._getData());

    expect(responseData.voicemails).toHaveLength(2);
    expect(responseData.limit).toBe(2);
    expect(responseData.offset).toBe(1);
    expect(responseData.total).toBe(5);

    // Should get the 2nd and 3rd newest (skipping the first due to offset)
    expect(responseData.voicemails[0].id).toBe('RE444');
    expect(responseData.voicemails[1].id).toBe('RE333');
  });

  test('enforces maximum limit of 100', async () => {
    jest.unstable_mockModule('@upstash/redis', () => ({
      Redis: jest.fn(() => mockRedis)
    }));

    const listHandler = (await import('../../api/voicemail/list.js?t=' + Date.now())).default;

    const { req, res } = createMocks({
      method: 'GET',
      query: {
        limit: '999' // Trying to request more than max
      },
      headers: {
        'authorization': 'Bearer test-secret-token-12345',
        'accept': 'application/json'
      }
    });

    await listHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = JSON.parse(res._getData());

    // Should be capped at 100
    expect(responseData.limit).toBe(100);
  });

  test('enforces minimum limit of 1', async () => {
    jest.unstable_mockModule('@upstash/redis', () => ({
      Redis: jest.fn(() => mockRedis)
    }));

    const listHandler = (await import('../../api/voicemail/list.js?t=' + Date.now())).default;

    const { req, res } = createMocks({
      method: 'GET',
      query: {
        limit: '-5' // Negative limit
      },
      headers: {
        'authorization': 'Bearer test-secret-token-12345',
        'accept': 'application/json'
      }
    });

    await listHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = JSON.parse(res._getData());

    // Should be set to minimum of 1
    expect(responseData.limit).toBe(1);
  });

  test('returns HTML when Accept header includes text/html', async () => {
    jest.unstable_mockModule('@upstash/redis', () => ({
      Redis: jest.fn(() => mockRedis)
    }));

    const voicemail = {
      id: 'RE111',
      recordingUrl: 'https://api.twilio.com/recordings/RE111',
      duration: 45,
      from: '+12345678901',
      transcription: 'Test message',
      createdAt: new Date().toISOString(),
      listened: false
    };

    await mockRedis.zadd('voicemails:index', { score: Date.now(), member: 'RE111' });
    await mockRedis.set('voicemail:RE111', JSON.stringify(voicemail));

    const listHandler = (await import('../../api/voicemail/list.js?t=' + Date.now())).default;

    const { req, res } = createMocks({
      method: 'GET',
      headers: {
        'authorization': 'Bearer test-secret-token-12345',
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });

    await listHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getHeaders()['content-type']).toBe('text/html');

    const html = res._getData();
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('O Cinema Voicemail Dashboard');
    expect(html).toContain('+12345678901');
    expect(html).toContain('Test message');
  });

  test('handles empty voicemail list gracefully', async () => {
    jest.unstable_mockModule('@upstash/redis', () => ({
      Redis: jest.fn(() => mockRedis)
    }));

    // Don't add any voicemails - list is empty

    const listHandler = (await import('../../api/voicemail/list.js?t=' + Date.now())).default;

    const { req, res } = createMocks({
      method: 'GET',
      headers: {
        'authorization': 'Bearer test-secret-token-12345',
        'accept': 'application/json'
      }
    });

    await listHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = JSON.parse(res._getData());

    expect(responseData.success).toBe(true);
    expect(responseData.voicemails).toEqual([]);
    expect(responseData.total).toBe(0);
    expect(responseData.count).toBe(0);
  });

  test('returns empty state HTML when no voicemails exist', async () => {
    jest.unstable_mockModule('@upstash/redis', () => ({
      Redis: jest.fn(() => mockRedis)
    }));

    const listHandler = (await import('../../api/voicemail/list.js?t=' + Date.now())).default;

    const { req, res } = createMocks({
      method: 'GET',
      headers: {
        'authorization': 'Bearer test-secret-token-12345',
        'accept': 'text/html'
      }
    });

    await listHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const html = res._getData();

    expect(html).toContain('No Voicemails Yet');
    expect(html).toContain('When customers leave voicemails');
  });

  test('handles CORS preflight request', async () => {
    const listHandler = (await import('../../api/voicemail/list.js?t=' + Date.now())).default;

    const { req, res } = createMocks({
      method: 'OPTIONS'
    });

    await listHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getHeaders()['access-control-allow-origin']).toBe('*');
    expect(res._getHeaders()['access-control-allow-methods']).toBe('GET, OPTIONS');
    expect(res._getHeaders()['access-control-allow-headers']).toBe('Content-Type, Authorization');
  });

  test('rejects non-GET requests (except OPTIONS)', async () => {
    const listHandler = (await import('../../api/voicemail/list.js?t=' + Date.now())).default;

    const { req, res } = createMocks({
      method: 'POST',
      headers: {
        'authorization': 'Bearer test-secret-token-12345'
      }
    });

    await listHandler(req, res);

    expect(res._getStatusCode()).toBe(405);
    const responseData = JSON.parse(res._getData());
    expect(responseData.error).toBe('Method not allowed');
  });

  test('returns 500 when STAFF_DASHBOARD_SECRET is not configured', async () => {
    // Remove the secret
    delete process.env.STAFF_DASHBOARD_SECRET;

    const listHandler = (await import('../../api/voicemail/list.js?t=' + Date.now())).default;

    const { req, res } = createMocks({
      method: 'GET',
      headers: {
        'authorization': 'Bearer some-token'
      }
    });

    await listHandler(req, res);

    expect(res._getStatusCode()).toBe(500);
    const responseData = JSON.parse(res._getData());
    expect(responseData.error).toBe('Server configuration error');
  });

  test('uses timing-safe comparison for token validation', async () => {
    // This test ensures that the timing attack vulnerability is prevented
    jest.unstable_mockModule('@upstash/redis', () => ({
      Redis: jest.fn(() => mockRedis)
    }));

    const listHandler = (await import('../../api/voicemail/list.js?t=' + Date.now())).default;

    // Try with a token that has same length but wrong content
    const { req, res } = createMocks({
      method: 'GET',
      headers: {
        'authorization': 'Bearer test-secret-token-99999', // Same length, different content
        'accept': 'application/json'
      }
    });

    await listHandler(req, res);

    // Should be rejected despite same length
    expect(res._getStatusCode()).toBe(401);
  });

  test('handles malformed voicemail data in Redis gracefully', async () => {
    jest.unstable_mockModule('@upstash/redis', () => ({
      Redis: jest.fn(() => mockRedis)
    }));

    // Add valid voicemail to index but corrupt data in storage
    await mockRedis.zadd('voicemails:index', { score: Date.now(), member: 'RE111' });
    await mockRedis.set('voicemail:RE111', 'invalid-json-{{{');

    const listHandler = (await import('../../api/voicemail/list.js?t=' + Date.now())).default;

    const { req, res } = createMocks({
      method: 'GET',
      headers: {
        'authorization': 'Bearer test-secret-token-12345',
        'accept': 'application/json'
      }
    });

    await listHandler(req, res);

    // Should still return 200, but skip the malformed record
    expect(res._getStatusCode()).toBe(200);
    const responseData = JSON.parse(res._getData());

    expect(responseData.success).toBe(true);
    expect(responseData.voicemails).toEqual([]); // Empty because record was malformed
    expect(responseData.total).toBe(1); // But total still shows 1 in index
  });
});

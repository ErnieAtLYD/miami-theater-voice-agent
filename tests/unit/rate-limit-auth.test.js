import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  checkRateLimit,
  recordFailedAttempt,
  resetRateLimit,
  getClientIp,
  getRateLimitConfig
} from '../../api/utils/rate-limit-auth.js';

// Mock Redis client
function createMockRedis() {
  const store = new Map();
  const ttls = new Map();

  return {
    get: jest.fn(async (key) => store.get(key) || null),
    set: jest.fn(async (key, value) => {
      store.set(key, value);
      return 'OK';
    }),
    incr: jest.fn(async (key) => {
      const current = parseInt(store.get(key) || '0', 10);
      const newValue = current + 1;
      store.set(key, String(newValue));
      return newValue;
    }),
    expire: jest.fn(async (key, seconds) => {
      ttls.set(key, seconds);
      return 1;
    }),
    ttl: jest.fn(async (key) => {
      return ttls.get(key) || -1;
    }),
    del: jest.fn(async (key) => {
      store.delete(key);
      ttls.delete(key);
      return 1;
    }),
    // Helper methods for testing
    _store: store,
    _ttls: ttls,
    _reset: () => {
      store.clear();
      ttls.clear();
    }
  };
}

// Mock request helper
function createMockRequest(overrides = {}) {
  return {
    headers: {
      'x-forwarded-for': '192.168.1.100',
      authorization: 'Bearer test-token',
      ...overrides.headers
    },
    socket: {
      remoteAddress: '10.0.0.1'
    },
    ...overrides
  };
}

describe('getClientIp', () => {
  test('extracts IP from x-forwarded-for header', () => {
    const req = createMockRequest({
      headers: {
        'x-forwarded-for': '203.0.113.1, 198.51.100.1'
      }
    });

    const ip = getClientIp(req);

    expect(ip).toBe('203.0.113.1');
  });

  test('handles single IP in x-forwarded-for', () => {
    const req = createMockRequest({
      headers: {
        'x-forwarded-for': '203.0.113.1'
      }
    });

    const ip = getClientIp(req);

    expect(ip).toBe('203.0.113.1');
  });

  test('falls back to x-real-ip header', () => {
    const req = createMockRequest({
      headers: {
        'x-real-ip': '203.0.113.2'
      }
    });
    delete req.headers['x-forwarded-for'];

    const ip = getClientIp(req);

    expect(ip).toBe('203.0.113.2');
  });

  test('falls back to socket.remoteAddress', () => {
    const req = createMockRequest({
      headers: {},
      socket: {
        remoteAddress: '203.0.113.3'
      }
    });

    const ip = getClientIp(req);

    expect(ip).toBe('203.0.113.3');
  });

  test('falls back to connection.remoteAddress', () => {
    const req = {
      headers: {},
      connection: {
        remoteAddress: '203.0.113.4'
      }
    };

    const ip = getClientIp(req);

    expect(ip).toBe('203.0.113.4');
  });

  test('returns unknown when no IP available', () => {
    const req = { headers: {} };

    const ip = getClientIp(req);

    expect(ip).toBe('unknown');
  });

  test('trims whitespace from forwarded IP', () => {
    const req = createMockRequest({
      headers: {
        'x-forwarded-for': ' 203.0.113.1 , 198.51.100.1'
      }
    });

    const ip = getClientIp(req);

    expect(ip).toBe('203.0.113.1');
  });
});

describe('checkRateLimit', () => {
  let redis;

  beforeEach(() => {
    redis = createMockRedis();
  });

  afterEach(() => {
    redis._reset();
  });

  test('allows request when no attempts recorded', async () => {
    const result = await checkRateLimit(redis, '192.168.1.100');

    expect(result.isLimited).toBe(false);
    expect(result.remainingAttempts).toBe(5);
  });

  test('allows request when below max attempts', async () => {
    const ip = '192.168.1.100';
    await redis.set(`auth:ratelimit:${ip}`, '3');

    const result = await checkRateLimit(redis, ip);

    expect(result.isLimited).toBe(false);
    expect(result.remainingAttempts).toBe(2);
  });

  test('blocks request when max attempts reached', async () => {
    const ip = '192.168.1.100';
    await redis.set(`auth:ratelimit:${ip}`, '5');
    redis._ttls.set(`auth:ratelimit:${ip}`, 600);

    const result = await checkRateLimit(redis, ip);

    expect(result.isLimited).toBe(true);
    expect(result.attempts).toBe(5);
    expect(result.resetTime).toBeGreaterThan(Date.now());
  });

  test('blocks request when attempts exceed max', async () => {
    const ip = '192.168.1.100';
    await redis.set(`auth:ratelimit:${ip}`, '10');
    redis._ttls.set(`auth:ratelimit:${ip}`, 600);

    const result = await checkRateLimit(redis, ip);

    expect(result.isLimited).toBe(true);
  });

  test('handles Redis unavailable gracefully', async () => {
    const result = await checkRateLimit(null, '192.168.1.100');

    expect(result.isLimited).toBe(false);
  });

  test('handles unknown IP gracefully', async () => {
    const result = await checkRateLimit(redis, 'unknown');

    expect(result.isLimited).toBe(false);
  });

  test('handles Redis error gracefully', async () => {
    redis.get.mockRejectedValue(new Error('Redis connection failed'));

    const result = await checkRateLimit(redis, '192.168.1.100');

    expect(result.isLimited).toBe(false);
  });

  test('calculates TTL correctly', async () => {
    const ip = '192.168.1.100';
    await redis.set(`auth:ratelimit:${ip}`, '5');
    redis._ttls.set(`auth:ratelimit:${ip}`, 300); // 5 minutes

    const beforeTime = Date.now();
    const result = await checkRateLimit(redis, ip);
    const afterTime = Date.now();

    expect(result.isLimited).toBe(true);
    // Reset time should be approximately now + 300 seconds
    expect(result.resetTime).toBeGreaterThan(beforeTime + 299000);
    expect(result.resetTime).toBeLessThan(afterTime + 301000);
  });
});

describe('recordFailedAttempt', () => {
  let redis;

  beforeEach(() => {
    redis = createMockRedis();
  });

  afterEach(() => {
    redis._reset();
  });

  test('records first failed attempt', async () => {
    const ip = '192.168.1.100';

    await recordFailedAttempt(redis, ip);

    expect(redis.incr).toHaveBeenCalledWith(`auth:ratelimit:${ip}`);
    expect(redis.expire).toHaveBeenCalledWith(`auth:ratelimit:${ip}`, 900);
  });

  test('increments attempt counter', async () => {
    const ip = '192.168.1.100';

    await recordFailedAttempt(redis, ip);
    await recordFailedAttempt(redis, ip);
    await recordFailedAttempt(redis, ip);

    const attempts = await redis.get(`auth:ratelimit:${ip}`);
    expect(parseInt(attempts, 10)).toBe(3);
  });

  test('extends block duration when max attempts reached', async () => {
    const ip = '192.168.1.100';
    await redis.set(`auth:ratelimit:${ip}`, '4');

    await recordFailedAttempt(redis, ip);

    expect(redis.expire).toHaveBeenCalledWith(`auth:ratelimit:${ip}`, 900);
  });

  test('handles Redis unavailable gracefully', async () => {
    await expect(recordFailedAttempt(null, '192.168.1.100')).resolves.not.toThrow();
  });

  test('handles unknown IP gracefully', async () => {
    await expect(recordFailedAttempt(redis, 'unknown')).resolves.not.toThrow();
  });

  test('handles Redis error gracefully', async () => {
    redis.incr.mockRejectedValue(new Error('Redis connection failed'));

    await expect(recordFailedAttempt(redis, '192.168.1.100')).resolves.not.toThrow();
  });

  test('only sets expiration on first attempt', async () => {
    const ip = '192.168.1.100';

    await recordFailedAttempt(redis, ip);
    redis.expire.mockClear();

    await recordFailedAttempt(redis, ip);

    // Expire should not be called for subsequent attempts (unless max reached)
    expect(redis.expire).not.toHaveBeenCalled();
  });
});

describe('resetRateLimit', () => {
  let redis;

  beforeEach(() => {
    redis = createMockRedis();
  });

  afterEach(() => {
    redis._reset();
  });

  test('deletes rate limit key', async () => {
    const ip = '192.168.1.100';
    await redis.set(`auth:ratelimit:${ip}`, '3');

    await resetRateLimit(redis, ip);

    expect(redis.del).toHaveBeenCalledWith(`auth:ratelimit:${ip}`);
    const value = await redis.get(`auth:ratelimit:${ip}`);
    expect(value).toBeNull();
  });

  test('handles Redis unavailable gracefully', async () => {
    await expect(resetRateLimit(null, '192.168.1.100')).resolves.not.toThrow();
  });

  test('handles unknown IP gracefully', async () => {
    await expect(resetRateLimit(redis, 'unknown')).resolves.not.toThrow();
  });

  test('handles Redis error gracefully', async () => {
    redis.del.mockRejectedValue(new Error('Redis connection failed'));

    await expect(resetRateLimit(redis, '192.168.1.100')).resolves.not.toThrow();
  });
});

describe('getRateLimitConfig', () => {
  test('returns configuration object', () => {
    const config = getRateLimitConfig();

    expect(config).toHaveProperty('maxAttempts');
    expect(config).toHaveProperty('windowSeconds');
    expect(config).toHaveProperty('blockDurationSeconds');
  });

  test('has reasonable default values', () => {
    const config = getRateLimitConfig();

    expect(config.maxAttempts).toBeGreaterThan(0);
    expect(config.windowSeconds).toBeGreaterThan(0);
    expect(config.blockDurationSeconds).toBeGreaterThan(0);
  });

  test('returns copy of config (not reference)', () => {
    const config1 = getRateLimitConfig();
    const config2 = getRateLimitConfig();

    expect(config1).toEqual(config2);
    expect(config1).not.toBe(config2);
  });
});

describe('Integration scenarios', () => {
  let redis;

  beforeEach(() => {
    redis = createMockRedis();
  });

  afterEach(() => {
    redis._reset();
  });

  test('full brute force attack scenario', async () => {
    const ip = '192.168.1.100';

    // First 4 attempts should be allowed
    for (let i = 0; i < 4; i++) {
      const checkResult = await checkRateLimit(redis, ip);
      expect(checkResult.isLimited).toBe(false);
      await recordFailedAttempt(redis, ip);
    }

    // 5th attempt should still be checked but will trigger block
    const checkBefore5th = await checkRateLimit(redis, ip);
    expect(checkBefore5th.isLimited).toBe(false);
    expect(checkBefore5th.remainingAttempts).toBe(1);

    await recordFailedAttempt(redis, ip);

    // After 5th attempt, should be blocked
    const checkAfter5th = await checkRateLimit(redis, ip);
    expect(checkAfter5th.isLimited).toBe(true);

    // 6th attempt should also be blocked
    const check6th = await checkRateLimit(redis, ip);
    expect(check6th.isLimited).toBe(true);
  });

  test('successful auth resets rate limit', async () => {
    const ip = '192.168.1.100';

    // Record some failed attempts
    await recordFailedAttempt(redis, ip);
    await recordFailedAttempt(redis, ip);
    await recordFailedAttempt(redis, ip);

    // Verify attempts are recorded
    let checkResult = await checkRateLimit(redis, ip);
    expect(checkResult.remainingAttempts).toBe(2);

    // Successful auth resets
    await resetRateLimit(redis, ip);

    // Should be back to fresh state
    checkResult = await checkRateLimit(redis, ip);
    expect(checkResult.isLimited).toBe(false);
    expect(checkResult.remainingAttempts).toBe(5);
  });

  test('different IPs are tracked independently', async () => {
    const ip1 = '192.168.1.100';
    const ip2 = '192.168.1.101';

    // IP1 makes 3 failed attempts
    await recordFailedAttempt(redis, ip1);
    await recordFailedAttempt(redis, ip1);
    await recordFailedAttempt(redis, ip1);

    // IP2 makes 1 failed attempt
    await recordFailedAttempt(redis, ip2);

    // Check both IPs
    const result1 = await checkRateLimit(redis, ip1);
    const result2 = await checkRateLimit(redis, ip2);

    expect(result1.remainingAttempts).toBe(2);
    expect(result2.remainingAttempts).toBe(4);
  });
});

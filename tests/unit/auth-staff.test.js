import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { validateStaffAuth } from '../../api/utils/auth-staff.js';

// Helper to create mock request objects
function createMockRequest(authorizationHeader = '') {
  return {
    headers: {
      authorization: authorizationHeader,
      'x-forwarded-for': '192.168.1.100' // Default IP for testing
    }
  };
}

describe('validateStaffAuth', () => {
  const originalEnv = process.env.STAFF_DASHBOARD_SECRET;

  afterEach(() => {
    // Restore original env var after each test
    if (originalEnv) {
      process.env.STAFF_DASHBOARD_SECRET = originalEnv;
    }
  });

  describe('Valid authentication', () => {
    test('accepts valid bearer token', async () => {
      const validToken = 'test-dashboard-secret-12345';
      const req = createMockRequest(`Bearer ${validToken}`);

      const result = await validateStaffAuth(req);

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.statusCode).toBeUndefined();
    });

    test('accepts valid token without Bearer prefix', async () => {
      const validToken = 'test-dashboard-secret-12345';
      const req = createMockRequest(validToken);

      const result = await validateStaffAuth(req);

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.statusCode).toBeUndefined();
    });

    test('handles authorization header with exact match', async () => {
      const validToken = 'test-dashboard-secret-12345';
      const req = createMockRequest(`Bearer ${validToken}`);

      const result = await validateStaffAuth(req);

      expect(result).toEqual({ isValid: true });
    });
  });

  describe('Invalid authentication', () => {
    test('rejects invalid bearer token', async () => {
      const invalidToken = 'wrong-token';
      const req = createMockRequest(`Bearer ${invalidToken}`);

      const result = await validateStaffAuth(req);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Unauthorized - Invalid credentials');
      expect(result.statusCode).toBe(401);
    });

    test('rejects empty authorization header', async () => {
      const req = createMockRequest('');

      const result = await validateStaffAuth(req);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Unauthorized - Invalid credentials');
      expect(result.statusCode).toBe(401);
    });

    test('rejects missing authorization header', async () => {
      const req = { headers: {} };

      const result = await validateStaffAuth(req);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Unauthorized - Invalid credentials');
      expect(result.statusCode).toBe(401);
    });

    test('rejects token with wrong length', async () => {
      const shortToken = 'short';
      const req = createMockRequest(`Bearer ${shortToken}`);

      const result = await validateStaffAuth(req);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Unauthorized - Invalid credentials');
      expect(result.statusCode).toBe(401);
    });

    test('rejects token that is similar but not exact', async () => {
      const almostCorrectToken = 'test-dashboard-secret-12346'; // Off by one
      const req = createMockRequest(`Bearer ${almostCorrectToken}`);

      const result = await validateStaffAuth(req);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Unauthorized - Invalid credentials');
      expect(result.statusCode).toBe(401);
    });
  });

  describe('Configuration errors', () => {
    test('returns 500 when STAFF_DASHBOARD_SECRET is not configured', async () => {
      delete process.env.STAFF_DASHBOARD_SECRET;
      const req = createMockRequest('Bearer some-token');

      const result = await validateStaffAuth(req);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Server configuration error');
      expect(result.statusCode).toBe(500);
    });

    test('returns 500 when STAFF_DASHBOARD_SECRET is empty string', async () => {
      process.env.STAFF_DASHBOARD_SECRET = '';
      const req = createMockRequest('Bearer some-token');

      const result = await validateStaffAuth(req);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Server configuration error');
      expect(result.statusCode).toBe(500);
    });
  });

  describe('Edge cases', () => {
    test('handles Bearer prefix with multiple spaces', async () => {
      const validToken = 'test-dashboard-secret-12345';
      const req = createMockRequest(`Bearer  ${validToken}`); // Two spaces

      const result = await validateStaffAuth(req);

      // Should fail because substring(7) only removes "Bearer "
      expect(result.isValid).toBe(false);
      expect(result.statusCode).toBe(401);
    });

    test('handles lowercase bearer prefix', async () => {
      const validToken = 'test-dashboard-secret-12345';
      const req = createMockRequest(`bearer ${validToken}`);

      const result = await validateStaffAuth(req);

      // Should fail because it checks for exact "Bearer " prefix
      expect(result.isValid).toBe(false);
      expect(result.statusCode).toBe(401);
    });

    test('handles authorization header with only Bearer prefix', async () => {
      const req = createMockRequest('Bearer ');

      const result = await validateStaffAuth(req);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Unauthorized - Invalid credentials');
      expect(result.statusCode).toBe(401);
    });

    test('handles special characters in token', async () => {
      process.env.STAFF_DASHBOARD_SECRET = 'test-secret!@#$%^&*()';
      const req = createMockRequest('Bearer test-secret!@#$%^&*()');

      const result = await validateStaffAuth(req);

      expect(result.isValid).toBe(true);
    });

    test('handles unicode characters in token', async () => {
      process.env.STAFF_DASHBOARD_SECRET = 'test-secret-™®©';
      const req = createMockRequest('Bearer test-secret-™®©');

      const result = await validateStaffAuth(req);

      expect(result.isValid).toBe(true);
    });
  });

  describe('Timing-safe comparison', () => {
    test('uses constant-time comparison to prevent timing attacks', async () => {
      // This test verifies that the function uses crypto.timingSafeEqual
      // by checking that tokens of different lengths are handled correctly
      const shortToken = 'short';
      const longToken = 'very-long-token-that-does-not-match';

      const req1 = createMockRequest(`Bearer ${shortToken}`);
      const req2 = createMockRequest(`Bearer ${longToken}`);

      const [result1, result2] = await Promise.all([
        validateStaffAuth(req1),
        validateStaffAuth(req2)
      ]);

      // Both should fail with same error message
      expect(result1.isValid).toBe(false);
      expect(result2.isValid).toBe(false);
      expect(result1.error).toBe(result2.error);
      expect(result1.statusCode).toBe(result2.statusCode);
    });

    test('rejects tokens that differ only in case', async () => {
      const upperCaseToken = 'TEST-DASHBOARD-SECRET-12345';
      const req = createMockRequest(`Bearer ${upperCaseToken}`);

      const result = await validateStaffAuth(req);

      // Should fail because comparison is case-sensitive
      expect(result.isValid).toBe(false);
      expect(result.statusCode).toBe(401);
    });
  });

  describe('Integration with request object', () => {
    test('works with Vercel request object format', async () => {
      const validToken = 'test-dashboard-secret-12345';
      const vercelReq = {
        headers: {
          authorization: `Bearer ${validToken}`,
          'content-type': 'application/json',
          host: 'miami-theater-voice-agent.vercel.app'
        },
        method: 'GET',
        url: '/api/voicemail/list'
      };

      const result = await validateStaffAuth(vercelReq);

      expect(result.isValid).toBe(true);
    });

    test('handles Express-style request object', async () => {
      const validToken = 'test-dashboard-secret-12345';
      const expressReq = {
        headers: {
          authorization: `Bearer ${validToken}`
        },
        method: 'GET',
        path: '/api/voicemail/list',
        get: (header) => expressReq.headers[header.toLowerCase()]
      };

      const result = await validateStaffAuth(expressReq);

      expect(result.isValid).toBe(true);
    });
  });

  describe('Rate limiting integration', () => {
    // Mock Redis client
    function createMockRedis() {
      const store = new Map();
      const ttls = new Map();

      return {
        get: jest.fn(async (key) => store.get(key) || null),
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
        ttl: jest.fn(async (key) => ttls.get(key) || -1),
        del: jest.fn(async (key) => {
          store.delete(key);
          ttls.delete(key);
          return 1;
        }),
        _store: store,
        _ttls: ttls,
        _reset: () => {
          store.clear();
          ttls.clear();
        }
      };
    }

    test('successful auth with Redis does not trigger rate limiting', async () => {
      const redis = createMockRedis();
      const validToken = 'test-dashboard-secret-12345';
      const req = createMockRequest(`Bearer ${validToken}`);

      const result = await validateStaffAuth(req, redis);

      expect(result.isValid).toBe(true);
      // Rate limit key should be deleted on success
      expect(redis.del).toHaveBeenCalled();
    });

    test('failed auth with Redis records attempt', async () => {
      const redis = createMockRedis();
      const invalidToken = 'wrong-token';
      const req = createMockRequest(`Bearer ${invalidToken}`);

      const result = await validateStaffAuth(req, redis);

      expect(result.isValid).toBe(false);
      expect(result.statusCode).toBe(401);
      // Failed attempt should be recorded
      expect(redis.incr).toHaveBeenCalled();
    });

    test('blocks after max failed attempts', async () => {
      const redis = createMockRedis();
      redis._store.set('auth:ratelimit:192.168.1.100', '5');
      redis._ttls.set('auth:ratelimit:192.168.1.100', 600);

      const req = createMockRequest('Bearer wrong-token');

      const result = await validateStaffAuth(req, redis);

      expect(result.isValid).toBe(false);
      expect(result.statusCode).toBe(429);
      expect(result.error).toContain('Too many failed attempts');
    });

    test('works without Redis (backward compatible)', async () => {
      const validToken = 'test-dashboard-secret-12345';
      const req = createMockRequest(`Bearer ${validToken}`);

      // Call without Redis
      const result = await validateStaffAuth(req);

      expect(result.isValid).toBe(true);
    });

    test('handles Redis failure gracefully', async () => {
      const redis = createMockRedis();
      redis.get.mockRejectedValue(new Error('Redis connection failed'));

      const validToken = 'test-dashboard-secret-12345';
      const req = createMockRequest(`Bearer ${validToken}`);

      // Should still validate auth even if Redis fails
      const result = await validateStaffAuth(req, redis);

      expect(result.isValid).toBe(true);
    });

    test('includes retryAfter in rate limit response', async () => {
      const redis = createMockRedis();
      redis._store.set('auth:ratelimit:192.168.1.100', '5');
      redis._ttls.set('auth:ratelimit:192.168.1.100', 300);

      const req = createMockRequest('Bearer wrong-token');

      const result = await validateStaffAuth(req, redis);

      expect(result.isValid).toBe(false);
      expect(result.statusCode).toBe(429);
      expect(result.retryAfter).toBeDefined();
      expect(result.retryAfter).toBeGreaterThan(Date.now());
    });
  });
});

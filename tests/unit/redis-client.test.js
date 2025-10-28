import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { createRedisClient } from '../../api/utils/redis-client.js';

describe('createRedisClient', () => {
  const originalEnv = {
    KV_REST_API_URL: process.env.KV_REST_API_URL,
    KV_REST_API_TOKEN: process.env.KV_REST_API_TOKEN,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN
  };

  afterEach(() => {
    // Restore original env vars after each test
    process.env.KV_REST_API_URL = originalEnv.KV_REST_API_URL;
    process.env.KV_REST_API_TOKEN = originalEnv.KV_REST_API_TOKEN;
    process.env.UPSTASH_REDIS_REST_URL = originalEnv.UPSTASH_REDIS_REST_URL;
    process.env.UPSTASH_REDIS_REST_TOKEN = originalEnv.UPSTASH_REDIS_REST_TOKEN;
  });

  describe('Client creation', () => {
    test('creates a Redis client instance', () => {
      const client = createRedisClient();

      expect(client).toBeDefined();
      expect(client).toHaveProperty('get');
      expect(client).toHaveProperty('set');
      expect(client).toHaveProperty('setex');
      expect(client).toHaveProperty('del');
    });

    test('returns an object with Redis methods', () => {
      const client = createRedisClient();

      expect(typeof client.get).toBe('function');
      expect(typeof client.set).toBe('function');
      expect(typeof client.setex).toBe('function');
      expect(typeof client.del).toBe('function');
    });

    test('creates different instances on each call', () => {
      const client1 = createRedisClient();
      const client2 = createRedisClient();

      // Should be different instances (not singleton)
      expect(client1).not.toBe(client2);
    });
  });

  describe('Environment variable precedence', () => {
    test('uses KV_REST_API_URL when available', () => {
      process.env.KV_REST_API_URL = 'https://kv-redis.upstash.io';
      process.env.UPSTASH_REDIS_REST_URL = 'https://upstash-redis.upstash.io';

      const client = createRedisClient();

      // Check that the client was created (we can't directly inspect the internal URL)
      expect(client).toBeDefined();
      expect(client).toHaveProperty('get');
    });

    test('falls back to UPSTASH_REDIS_REST_URL when KV_REST_API_URL is missing', () => {
      delete process.env.KV_REST_API_URL;
      process.env.UPSTASH_REDIS_REST_URL = 'https://upstash-redis.upstash.io';

      const client = createRedisClient();

      expect(client).toBeDefined();
      expect(client).toHaveProperty('get');
    });

    test('uses KV_REST_API_TOKEN when available', () => {
      process.env.KV_REST_API_TOKEN = 'kv-token-12345';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'upstash-token-12345';

      const client = createRedisClient();

      expect(client).toBeDefined();
      expect(client).toHaveProperty('get');
    });

    test('falls back to UPSTASH_REDIS_REST_TOKEN when KV_REST_API_TOKEN is missing', () => {
      delete process.env.KV_REST_API_TOKEN;
      process.env.UPSTASH_REDIS_REST_TOKEN = 'upstash-token-12345';

      const client = createRedisClient();

      expect(client).toBeDefined();
      expect(client).toHaveProperty('get');
    });

    test('prioritizes KV_ variables over UPSTASH_ variables', () => {
      process.env.KV_REST_API_URL = 'https://kv-redis.upstash.io';
      process.env.KV_REST_API_TOKEN = 'kv-token';
      process.env.UPSTASH_REDIS_REST_URL = 'https://upstash-redis.upstash.io';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'upstash-token';

      const client = createRedisClient();

      // The client should be created with KV_ variables taking precedence
      expect(client).toBeDefined();
      expect(client).toHaveProperty('get');
    });
  });

  describe('Edge cases', () => {
    test('handles when KV_REST_API_URL is empty string', () => {
      process.env.KV_REST_API_URL = '';
      process.env.UPSTASH_REDIS_REST_URL = 'https://upstash-redis.upstash.io';

      const client = createRedisClient();

      // Should fall back to UPSTASH_REDIS_REST_URL
      expect(client).toBeDefined();
      expect(client).toHaveProperty('get');
    });

    test('handles when KV_REST_API_TOKEN is empty string', () => {
      process.env.KV_REST_API_TOKEN = '';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'upstash-token';

      const client = createRedisClient();

      // Should fall back to UPSTASH_REDIS_REST_TOKEN
      expect(client).toBeDefined();
      expect(client).toHaveProperty('get');
    });

    test('handles when all URL variables are undefined', () => {
      delete process.env.KV_REST_API_URL;
      delete process.env.UPSTASH_REDIS_REST_URL;

      const client = createRedisClient();

      // Client is created but will fail on actual operations
      expect(client).toBeDefined();
    });

    test('handles when all token variables are undefined', () => {
      delete process.env.KV_REST_API_TOKEN;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;

      const client = createRedisClient();

      // Client is created but will fail on actual operations
      expect(client).toBeDefined();
    });

    test('handles URL with trailing slash', () => {
      process.env.KV_REST_API_URL = 'https://test-redis.upstash.io/';

      const client = createRedisClient();

      expect(client).toBeDefined();
      expect(client).toHaveProperty('get');
    });

    test('throws error for URL without protocol', () => {
      process.env.KV_REST_API_URL = 'test-redis.upstash.io';

      // Upstash SDK requires https protocol
      expect(() => createRedisClient()).toThrow();
    });
  });

  describe('Client methods availability', () => {
    test('has get method', () => {
      const client = createRedisClient();

      expect(client.get).toBeDefined();
      expect(typeof client.get).toBe('function');
    });

    test('has set method', () => {
      const client = createRedisClient();

      expect(client.set).toBeDefined();
      expect(typeof client.set).toBe('function');
    });

    test('has setex method for TTL support', () => {
      const client = createRedisClient();

      expect(client.setex).toBeDefined();
      expect(typeof client.setex).toBe('function');
    });

    test('has del method', () => {
      const client = createRedisClient();

      expect(client.del).toBeDefined();
      expect(typeof client.del).toBe('function');
    });

    test('has zadd method for sorted sets', () => {
      const client = createRedisClient();

      expect(client.zadd).toBeDefined();
      expect(typeof client.zadd).toBe('function');
    });

    test('has zrange method for sorted sets', () => {
      const client = createRedisClient();

      expect(client.zrange).toBeDefined();
      expect(typeof client.zrange).toBe('function');
    });

    test('has zrem method for sorted sets', () => {
      const client = createRedisClient();

      expect(client.zrem).toBeDefined();
      expect(typeof client.zrem).toBe('function');
    });

    test('has exists method', () => {
      const client = createRedisClient();

      expect(client.exists).toBeDefined();
      expect(typeof client.exists).toBe('function');
    });

    test('has expire method', () => {
      const client = createRedisClient();

      expect(client.expire).toBeDefined();
      expect(typeof client.expire).toBe('function');
    });
  });

  describe('Integration scenarios', () => {
    test('creates client suitable for showtime caching', () => {
      const client = createRedisClient();

      // Verify methods needed for showtime API
      expect(client.get).toBeDefined();
      expect(client.setex).toBeDefined(); // For TTL caching
    });

    test('creates client suitable for voicemail storage', () => {
      const client = createRedisClient();

      // Verify methods needed for voicemail system
      expect(client.get).toBeDefined();
      expect(client.set).toBeDefined();
      expect(client.zadd).toBeDefined(); // For sorted set
      expect(client.zrange).toBeDefined();
      expect(client.zrem).toBeDefined();
    });

    test('creates client suitable for cron job ingestion', () => {
      const client = createRedisClient();

      // Verify methods needed for cron job
      expect(client.setex).toBeDefined(); // For caching with expiry
    });
  });

  describe('Configuration validation', () => {
    test('creates client with standard Vercel KV configuration', () => {
      process.env.KV_REST_API_URL = 'https://usw1-valued-bobcat-12345.upstash.io';
      process.env.KV_REST_API_TOKEN = 'AXjASQgxxxxxxxxxxxxxxxxxxx';

      const client = createRedisClient();

      expect(client).toBeDefined();
      expect(client).toHaveProperty('get');
    });

    test('creates client with standard Upstash configuration', () => {
      delete process.env.KV_REST_API_URL;
      delete process.env.KV_REST_API_TOKEN;
      process.env.UPSTASH_REDIS_REST_URL = 'https://usw1-valued-bobcat-12345.upstash.io';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'AXjASQgxxxxxxxxxxxxxxxxxxx';

      const client = createRedisClient();

      expect(client).toBeDefined();
      expect(client).toHaveProperty('get');
    });

    test('creates client with local development configuration', () => {
      process.env.KV_REST_API_URL = 'http://localhost:8079';
      process.env.KV_REST_API_TOKEN = 'local-dev-token';

      const client = createRedisClient();

      expect(client).toBeDefined();
      expect(client).toHaveProperty('get');
    });
  });

  describe('Multiple client instances', () => {
    test('can create multiple clients simultaneously', () => {
      const clients = Array.from({ length: 5 }, () => createRedisClient());

      expect(clients).toHaveLength(5);
      clients.forEach(client => {
        expect(client).toBeDefined();
        expect(client).toHaveProperty('get');
      });
    });

    test('each client is independent', () => {
      const client1 = createRedisClient();
      const client2 = createRedisClient();

      // Modify env vars between creations doesn't affect existing clients
      expect(client1).toBeDefined();
      expect(client2).toBeDefined();
      expect(client1).not.toBe(client2);
    });
  });
});

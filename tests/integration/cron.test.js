import { describe, test, expect, beforeEach, jest, afterEach } from '@jest/globals';
import { createMocks } from 'node-mocks-http';
import { getMockAgileResponse } from '../mocks/mockData.js';

// Mock fetch globally
global.fetch = jest.fn();

describe('/api/cron/ingest-showtimes (simple)', () => {
  let originalEnv;

  beforeEach(() => {
    // Save original env
    originalEnv = { ...process.env };

    // Set test environment
    process.env.CRON_SECRET = 'test-secret';
    process.env.AGILE_GUID = 'test-guid';
    process.env.KV_REST_API_URL = 'https://test-redis.upstash.io';
    process.env.KV_REST_API_TOKEN = 'test-token';

    // Reset fetch mock
    fetch.mockClear();
  });

  afterEach(() => {
    // Restore environment
    process.env = originalEnv;
    jest.resetModules();
  });

  test('rejects unauthorized requests', async () => {
    const handler = (await import('../../api/cron/ingest-showtimes.js')).default;
    const { req, res } = createMocks({
      method: 'POST',
      headers: {}
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(401);
    const data = JSON.parse(res._getData());
    expect(data.error).toBe('Unauthorized');
  });

  test('accepts valid authorization', async () => {
    // Mock successful fetch response
    fetch.mockResolvedValueOnce({
      ok: true,
      headers: {
        get: () => 'application/json'
      },
      json: () => Promise.resolve(getMockAgileResponse())
    });

    const handler = (await import('../../api/cron/ingest-showtimes.js')).default;
    const { req, res } = createMocks({
      method: 'POST',
      headers: {
        authorization: 'Bearer test-secret'
      }
    });

    await handler(req, res);

    // Should not be 401 (unauthorized)
    expect(res._getStatusCode()).not.toBe(401);
  });

  test('handles Agile API errors', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error'
    });

    const handler = (await import('../../api/cron/ingest-showtimes.js')).default;
    const { req, res } = createMocks({
      method: 'POST',
      headers: {
        authorization: 'Bearer test-secret'
      }
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(500);
    const data = JSON.parse(res._getData());
    expect(data.error).toContain('Agile API error');
  });

  test('constructs correct API URL', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      headers: {
        get: () => 'application/json'
      },
      json: () => Promise.resolve(getMockAgileResponse())
    });

    const handler = (await import('../../api/cron/ingest-showtimes.js')).default;
    const { req, res } = createMocks({
      method: 'POST',
      headers: {
        authorization: 'Bearer test-secret'
      }
    });

    await handler(req, res);

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('https://prod3.agileticketing.net/websales/feed.ashx'),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Accept': 'application/json',
          'User-Agent': 'Miami-Theater-Voice-Agent/1.0'
        })
      })
    );

    const calledUrl = fetch.mock.calls[0][0];
    expect(calledUrl).toContain('guid=test-guid');
    expect(calledUrl).toContain('showslist=true');
    expect(calledUrl).toContain('format=json');
    expect(calledUrl).toContain('v=latest');
  });
});
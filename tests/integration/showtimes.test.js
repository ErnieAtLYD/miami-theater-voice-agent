import { describe, test, expect, beforeEach, jest, afterEach } from '@jest/globals';
import { createMocks } from 'node-mocks-http';
import { getMockShowtimesData } from '../mocks/mockData.js';

// Simple functional test approach
describe('/api/showtimes (simple)', () => {
  let originalEnv;

  beforeEach(() => {
    // Save original env
    originalEnv = { ...process.env };

    // Set test environment
    process.env.VERCEL_ENV = 'development';
    process.env.KV_REST_API_URL = 'https://test-redis.upstash.io';
    process.env.KV_REST_API_TOKEN = 'test-token';
  });

  afterEach(() => {
    // Restore environment
    process.env = originalEnv;
    jest.resetModules();
  });

  test('returns mock data in development mode when Redis fails', async () => {
    // Import handler after setting up environment
    const handler = (await import('../../api/showtimes.js')).default;

    const { req, res } = createMocks({ method: 'GET' });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());

    expect(data.success).toBe(true);
    expect(data.data).toBeDefined();
    expect(Array.isArray(data.data)).toBe(true);
    expect(data.conversational_summary).toBeDefined();
  });

  test('handles CORS preflight request', async () => {
    const handler = (await import('../../api/showtimes.js')).default;
    const { req, res } = createMocks({ method: 'OPTIONS' });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getHeaders()['access-control-allow-origin']).toBe('*');
    expect(res._getHeaders()['access-control-allow-methods']).toBe('GET, POST, OPTIONS');
    expect(res._getHeaders()['access-control-allow-headers']).toBe('Content-Type, Authorization');
  });

  test('handles date query parameter', async () => {
    const handler = (await import('../../api/showtimes.js')).default;
    const today = new Date().toISOString().split('T')[0];
    const { req, res } = createMocks({
      method: 'GET',
      query: { date: today }
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.success).toBe(true);
    expect(data.query_info.date).toBe(today);
  });

  test('handles movie title search', async () => {
    const handler = (await import('../../api/showtimes.js')).default;
    const { req, res } = createMocks({
      method: 'GET',
      query: { movie_title: 'Substance' }
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.success).toBe(true);
    expect(data.query_info.movie_title).toBe('Substance');
  });

  test('validates response format for voice agent', async () => {
    const handler = (await import('../../api/showtimes.js')).default;
    const { req, res } = createMocks({ method: 'GET' });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());

    // Validate required response structure
    expect(data).toHaveProperty('success');
    expect(data).toHaveProperty('data');
    expect(data).toHaveProperty('conversational_summary');
    expect(data).toHaveProperty('last_updated');
    expect(data).toHaveProperty('query_info');

    // Validate data format for voice agent
    if (data.data.length > 0) {
      const showtime = data.data[0];
      expect(showtime).toHaveProperty('movie_title');
      expect(showtime).toHaveProperty('summary');
      expect(typeof showtime.summary).toBe('string');
    }
  });
});
// Jest setup file
import { jest } from '@jest/globals';

// Global test setup
global.console = {
  ...console,
  // Suppress console.log/warn during tests unless explicitly needed
  log: jest.fn(),
  warn: jest.fn(),
  error: console.error // Keep error logging
};

// Mock environment variables for tests
process.env.NODE_ENV = 'test';
process.env.VERCEL_ENV = 'development';
process.env.CRON_SECRET = 'test-secret';
process.env.AGILE_GUID = 'test-guid';
process.env.KV_REST_API_URL = 'https://test-redis.upstash.io';
process.env.KV_REST_API_TOKEN = 'test-token';
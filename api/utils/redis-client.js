// api/utils/redis-client.js
// Centralized Redis client initialization for Upstash Redis
import { Redis } from '@upstash/redis';

/**
 * Creates and returns a configured Redis client instance
 *
 * Environment Variable Precedence:
 * 1. KV_REST_API_URL / KV_REST_API_TOKEN (Vercel KV - Recommended)
 * 2. UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN (Upstash Direct - Fallback)
 *
 * @returns {Redis} Configured Upstash Redis client
 */
export function createRedisClient() {
  return new Redis({
    // Vercel KV variables take precedence over Upstash direct variables
    url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

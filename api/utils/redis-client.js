// api/utils/redis-client.js
// Centralized Redis client initialization for Upstash Redis
import { Redis } from '@upstash/redis';

/**
 * Creates and returns a configured Redis client instance
 * @returns {Redis} Configured Upstash Redis client
 */
export function createRedisClient() {
  return new Redis({
    url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

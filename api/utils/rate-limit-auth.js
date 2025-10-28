// api/utils/rate-limit-auth.js
// Rate limiting for authentication attempts to prevent brute force attacks

/**
 * Configuration for rate limiting
 */
const RATE_LIMIT_CONFIG = {
  maxAttempts: 5,           // Maximum failed attempts
  windowSeconds: 900,       // Time window in seconds (15 minutes)
  blockDurationSeconds: 900 // Block duration after max attempts (15 minutes)
};

/**
 * Gets the client IP address from the request
 * @param {object} req - Express/Vercel request object
 * @returns {string} Client IP address
 */
function getClientIp(req) {
  // Check x-forwarded-for header (set by proxies/load balancers)
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    // x-forwarded-for can contain multiple IPs, use the first one
    return forwardedFor.split(',')[0].trim();
  }

  // Fallback to x-real-ip header
  const realIp = req.headers['x-real-ip'];
  if (realIp) {
    return realIp;
  }

  // Fallback to remote address
  return req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown';
}

/**
 * Checks if an IP is currently rate limited
 * @param {object} redis - Redis client instance
 * @param {string} ip - Client IP address
 * @returns {Promise<object>} Rate limit status { isLimited: boolean, remainingAttempts?: number, resetTime?: number }
 */
export async function checkRateLimit(redis, ip) {
  if (!redis || !ip || ip === 'unknown') {
    // If Redis is unavailable or IP is unknown, allow the request
    // This ensures the service remains available even if Redis fails
    return { isLimited: false };
  }

  const key = `auth:ratelimit:${ip}`;

  try {
    // Get current attempt count
    const attempts = await redis.get(key);
    const currentAttempts = attempts ? parseInt(attempts, 10) : 0;

    // Check if IP is blocked
    if (currentAttempts >= RATE_LIMIT_CONFIG.maxAttempts) {
      const ttl = await redis.ttl(key);
      const resetTime = Date.now() + (ttl * 1000);

      console.warn('Rate limit exceeded', {
        ip,
        attempts: currentAttempts,
        resetInSeconds: ttl
      });

      return {
        isLimited: true,
        attempts: currentAttempts,
        resetTime
      };
    }

    // Not rate limited
    return {
      isLimited: false,
      remainingAttempts: RATE_LIMIT_CONFIG.maxAttempts - currentAttempts
    };
  } catch (error) {
    console.error('Rate limit check failed', { ip, error: error.message });
    // On error, allow the request (fail open)
    return { isLimited: false };
  }
}

/**
 * Records a failed authentication attempt
 * @param {object} redis - Redis client instance
 * @param {string} ip - Client IP address
 * @returns {Promise<void>}
 */
export async function recordFailedAttempt(redis, ip) {
  if (!redis || !ip || ip === 'unknown') {
    return;
  }

  const key = `auth:ratelimit:${ip}`;

  try {
    // Increment attempt counter
    const newCount = await redis.incr(key);

    // Set expiration on first attempt
    if (newCount === 1) {
      await redis.expire(key, RATE_LIMIT_CONFIG.windowSeconds);
    }

    // If max attempts reached, extend the block duration
    if (newCount >= RATE_LIMIT_CONFIG.maxAttempts) {
      await redis.expire(key, RATE_LIMIT_CONFIG.blockDurationSeconds);
      console.warn('IP blocked due to too many failed attempts', {
        ip,
        attempts: newCount,
        blockDurationSeconds: RATE_LIMIT_CONFIG.blockDurationSeconds
      });
    }

    console.log('Failed auth attempt recorded', {
      ip,
      attempts: newCount,
      remaining: Math.max(0, RATE_LIMIT_CONFIG.maxAttempts - newCount)
    });
  } catch (error) {
    console.error('Failed to record auth attempt', { ip, error: error.message });
    // Don't throw - failing to record shouldn't break auth flow
  }
}

/**
 * Resets the rate limit for an IP (called on successful auth)
 * @param {object} redis - Redis client instance
 * @param {string} ip - Client IP address
 * @returns {Promise<void>}
 */
export async function resetRateLimit(redis, ip) {
  if (!redis || !ip || ip === 'unknown') {
    return;
  }

  const key = `auth:ratelimit:${ip}`;

  try {
    await redis.del(key);
    console.log('Rate limit reset for successful auth', { ip });
  } catch (error) {
    console.error('Failed to reset rate limit', { ip, error: error.message });
    // Don't throw - this is a cleanup operation
  }
}

/**
 * Gets the rate limit configuration (useful for testing)
 * @returns {object} Current rate limit configuration
 */
export function getRateLimitConfig() {
  return { ...RATE_LIMIT_CONFIG };
}

export { getClientIp };

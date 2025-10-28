// api/utils/auth-staff.js
// Centralized staff authentication for voicemail endpoints
import crypto from 'crypto';
import { checkRateLimit, recordFailedAttempt, resetRateLimit, getClientIp } from './rate-limit-auth.js';

/**
 * Validates staff authentication using bearer token with optional rate limiting
 * @param {object} req - Express/Vercel request object
 * @param {object} [redis] - Optional Redis client for rate limiting
 * @returns {Promise<object>} Result object with { isValid: boolean, error?: string, statusCode?: number }
 */
export async function validateStaffAuth(req, redis = null) {
  const authHeader = req.headers.authorization || '';
  const dashboardSecret = process.env.STAFF_DASHBOARD_SECRET;
  const clientIp = getClientIp(req);

  if (!dashboardSecret) {
    console.error('STAFF_DASHBOARD_SECRET not configured');
    return {
      isValid: false,
      error: 'Server configuration error',
      statusCode: 500
    };
  }

  // Check rate limit if Redis is available
  if (redis) {
    const rateLimitStatus = await checkRateLimit(redis, clientIp);
    if (rateLimitStatus.isLimited) {
      return {
        isValid: false,
        error: 'Too many failed attempts. Please try again later.',
        statusCode: 429,
        retryAfter: rateLimitStatus.resetTime
      };
    }
  }

  // Extract token from "Bearer <token>" format
  const providedToken = authHeader.startsWith('Bearer ')
    ? authHeader.substring(7)
    : authHeader;

  // Use constant-time comparison to prevent timing attacks
  const expectedBuffer = Buffer.from(dashboardSecret);
  const providedBuffer = Buffer.from(providedToken);

  const isValid = expectedBuffer.length === providedBuffer.length &&
                  crypto.timingSafeEqual(expectedBuffer, providedBuffer);

  if (!isValid) {
    // Log failed authentication attempt for security monitoring
    console.warn('Failed authentication attempt', {
      ip: clientIp,
      hasRedis: !!redis,
      timestamp: new Date().toISOString()
    });

    // Record failed attempt if Redis is available
    if (redis) {
      await recordFailedAttempt(redis, clientIp);
    }

    return {
      isValid: false,
      error: 'Unauthorized - Invalid credentials',
      statusCode: 401
    };
  }

  // Log successful authentication for audit trail
  console.log('Successful authentication', {
    ip: clientIp,
    timestamp: new Date().toISOString()
  });

  // Reset rate limit on successful auth
  if (redis) {
    await resetRateLimit(redis, clientIp);
  }

  return { isValid: true };
}

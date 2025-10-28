// api/utils/auth-staff.js
// Centralized staff authentication for voicemail endpoints
import crypto from 'crypto';

/**
 * Validates staff authentication using bearer token
 * @param {object} req - Express/Vercel request object
 * @returns {object} Result object with { isValid: boolean, error?: string, statusCode?: number }
 */
export function validateStaffAuth(req) {
  const authHeader = req.headers.authorization || '';
  const dashboardSecret = process.env.STAFF_DASHBOARD_SECRET;

  if (!dashboardSecret) {
    console.error('STAFF_DASHBOARD_SECRET not configured');
    return {
      isValid: false,
      error: 'Server configuration error',
      statusCode: 500
    };
  }

  // Extract token from "Bearer <token>" format
  const providedToken = authHeader.startsWith('Bearer ')
    ? authHeader.substring(7)
    : authHeader;

  // Use constant-time comparison to prevent timing attacks
  const expectedBuffer = Buffer.from(dashboardSecret);
  const providedBuffer = Buffer.from(providedToken);

  if (expectedBuffer.length !== providedBuffer.length ||
      !crypto.timingSafeEqual(expectedBuffer, providedBuffer)) {
    return {
      isValid: false,
      error: 'Unauthorized - Invalid credentials',
      statusCode: 401
    };
  }

  return { isValid: true };
}

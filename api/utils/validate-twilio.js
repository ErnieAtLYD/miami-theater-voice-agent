// api/utils/validate-twilio.js
// Centralized Twilio webhook signature validation
import twilio from 'twilio';

/**
 * Validates a Twilio webhook request signature
 * @param {object} req - Express/Vercel request object
 * @returns {object} Result object with { isValid: boolean, error?: string }
 */
export function validateTwilioRequest(req) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioSignature = req.headers['x-twilio-signature'];

  if (!authToken) {
    console.error('TWILIO_AUTH_TOKEN not configured');
    return {
      isValid: false,
      error: 'Server configuration error',
      statusCode: 500
    };
  }

  // Construct the full URL that Twilio used to make the request
  // Must match exactly what Twilio used for signature generation
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;

  // Remove query string from URL for validation - Twilio includes params in body
  const urlPath = req.url.split('?')[0];
  const url = `${protocol}://${host}${urlPath}`;

  // Log for debugging
  console.log('Validating Twilio signature:', {
    url,
    protocol,
    host,
    hasSignature: !!twilioSignature,
    bodyKeys: Object.keys(req.body || {}),
    headers: {
      'x-forwarded-proto': req.headers['x-forwarded-proto'],
      'x-forwarded-host': req.headers['x-forwarded-host'],
      host: req.headers.host
    }
  });

  // Validate the request
  const isValidRequest = twilio.validateRequest(
    authToken,
    twilioSignature,
    url,
    req.body || {}
  );

  if (!isValidRequest) {
    console.error('Invalid Twilio signature', {
      url,
      signature: twilioSignature,
      bodyKeys: Object.keys(req.body || {})
    });
    return {
      isValid: false,
      error: 'Forbidden - Invalid signature',
      statusCode: 403
    };
  }

  return { isValid: true };
}

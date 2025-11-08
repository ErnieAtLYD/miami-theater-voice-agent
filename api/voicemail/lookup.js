// api/voicemail/lookup.js
// Manual caller lookup endpoint for staff to refresh caller information

import { createRedisClient } from '../utils/redis-client.js';
import { validateStaffAuth } from '../utils/auth-staff.js';
import { lookupCaller } from '../utils/twilio-lookup.js';

/**
 * Manual caller lookup endpoint
 * Forces a fresh Twilio Lookup API call and updates voicemail record
 *
 * @param {*} req - Request object
 * @param {*} res - Response object
 * @returns {Promise<void>}
 */
export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Initialize Redis
    const redis = createRedisClient();

    // Authenticate staff access with rate limiting
    const authValidation = await validateStaffAuth(req, redis);
    if (!authValidation.isValid) {
      return res.status(authValidation.statusCode).json({ error: authValidation.error });
    }

    // Get voicemail ID from query parameter
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({ error: 'Missing voicemail ID' });
    }

    // Fetch voicemail record
    const voicemailData = await redis.get(`voicemail:${id}`);

    if (!voicemailData) {
      return res.status(404).json({ error: 'Voicemail not found' });
    }

    const voicemail = typeof voicemailData === 'string'
      ? JSON.parse(voicemailData)
      : voicemailData;

    // Get phone number from voicemail record
    const phoneNumber = voicemail.from;

    if (!phoneNumber) {
      return res.status(400).json({ error: 'Voicemail has no phone number' });
    }

    // Perform fresh Twilio Lookup (force refresh = true)
    const lookupData = await lookupCaller(phoneNumber, redis, true);

    // Update voicemail record with lookup data
    if (lookupData) {
      voicemail.callerName = lookupData.callerName;
      voicemail.callerType = lookupData.callerType;
      voicemail.lineType = lookupData.lineType;
      voicemail.lineTypeIntelligence = {
        type: lookupData.lineType,
        carrierName: lookupData.carrierName,
        mobileCountryCode: lookupData.mobileCountryCode,
        mobileNetworkCode: lookupData.mobileNetworkCode
      };
      voicemail.lookupLastUpdated = lookupData.lastUpdated;

      // Save updated voicemail
      await redis.set(`voicemail:${id}`, JSON.stringify(voicemail));

      console.log(`Updated voicemail ${id} with lookup data`);

      return res.status(200).json({
        success: true,
        voicemail,
        lookupData
      });
    } else {
      // Lookup failed
      return res.status(503).json({
        error: 'Lookup failed',
        message: 'Unable to retrieve caller information from Twilio. This may be due to an invalid number or service issues.'
      });
    }

  } catch (error) {
    console.error('Voicemail lookup error:', error);
    return res.status(500).json({ error: 'Failed to lookup caller information' });
  }
}

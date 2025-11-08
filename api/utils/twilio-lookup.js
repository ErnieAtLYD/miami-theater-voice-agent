// api/utils/twilio-lookup.js
// Twilio Lookup API integration with Redis caching

import twilio from 'twilio';

/**
 * Lookup caller information using Twilio Lookup v2 API
 * Results are cached in Redis for 30 days to minimize API costs
 *
 * @param {string} phoneNumber - Phone number in E.164 format
 * @param {Object} redis - Redis client instance
 * @param {boolean} forceRefresh - Skip cache and force fresh lookup
 * @returns {Promise<Object|null>} Caller information or null if lookup fails
 */
export async function lookupCaller(phoneNumber, redis, forceRefresh = false) {
  // Check if feature is enabled
  const lookupEnabled = process.env.TWILIO_LOOKUP_ENABLED !== 'false'; // Default to true
  if (!lookupEnabled) {
    console.log('Twilio Lookup is disabled via TWILIO_LOOKUP_ENABLED');
    return null;
  }

  // Validate required credentials
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    console.error('Twilio credentials not configured');
    return null;
  }

  if (!phoneNumber) {
    console.error('Phone number is required for lookup');
    return null;
  }

  // Normalize phone number (ensure E.164 format)
  const normalizedNumber = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
  const cacheKey = `lookup:${normalizedNumber}`;

  try {
    // Check cache first (unless force refresh)
    if (!forceRefresh && redis) {
      const cachedData = await redis.get(cacheKey);
      if (cachedData) {
        console.log(`Lookup cache hit for ${normalizedNumber}`);
        const parsed = typeof cachedData === 'string' ? JSON.parse(cachedData) : cachedData;
        return parsed;
      }
    }

    // Cache miss or force refresh - call Twilio Lookup API
    console.log(`Performing Twilio Lookup for ${normalizedNumber}`);

    const client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );

    // Call Lookup v2 API with caller name and line type intelligence
    const lookupResult = await client.lookups.v2
      .phoneNumbers(normalizedNumber)
      .fetch({
        fields: 'caller_name,line_type_intelligence'
      });

    // Extract relevant data
    const callerInfo = {
      phoneNumber: lookupResult.phoneNumber,
      callerName: lookupResult.callerName?.caller_name || null,
      callerType: lookupResult.callerName?.caller_type || null,
      lineType: lookupResult.lineTypeIntelligence?.type || 'unknown',
      carrierName: lookupResult.lineTypeIntelligence?.carrier_name || null,
      mobileCountryCode: lookupResult.lineTypeIntelligence?.mobile_country_code || null,
      mobileNetworkCode: lookupResult.lineTypeIntelligence?.mobile_network_code || null,
      lastUpdated: new Date().toISOString()
    };

    // Cache the result for 30 days (2592000 seconds)
    if (redis) {
      await redis.setex(cacheKey, 2592000, JSON.stringify(callerInfo));
      console.log(`Cached lookup result for ${normalizedNumber}`);
    }

    return callerInfo;

  } catch (error) {
    // Log error but don't fail - graceful degradation
    console.error(`Twilio Lookup error for ${normalizedNumber}:`, error.message);

    // If error is "not found" or invalid number, cache a null result briefly (1 hour)
    // to avoid repeated failed lookups
    if (error.status === 404 || error.code === 20404) {
      if (redis) {
        await redis.setex(cacheKey, 3600, JSON.stringify({
          phoneNumber: normalizedNumber,
          callerName: null,
          lineType: 'unknown',
          lastUpdated: new Date().toISOString(),
          lookupFailed: true
        }));
      }
    }

    return null;
  }
}

/**
 * Get cached lookup data without making an API call
 *
 * @param {string} phoneNumber - Phone number in E.164 format
 * @param {Object} redis - Redis client instance
 * @returns {Promise<Object|null>} Cached caller information or null
 */
export async function getCachedLookup(phoneNumber, redis) {
  if (!phoneNumber || !redis) {
    return null;
  }

  const normalizedNumber = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
  const cacheKey = `lookup:${normalizedNumber}`;

  try {
    const cachedData = await redis.get(cacheKey);
    if (cachedData) {
      return typeof cachedData === 'string' ? JSON.parse(cachedData) : cachedData;
    }
    return null;
  } catch (error) {
    console.error('Error fetching cached lookup:', error);
    return null;
  }
}

/**
 * Format line type for display
 *
 * @param {string} lineType - Line type from Twilio (mobile, landline, voip, etc.)
 * @returns {Object} Display emoji and label
 */
export function formatLineType(lineType) {
  const types = {
    mobile: { emoji: '📱', label: 'Mobile' },
    landline: { emoji: '☎️', label: 'Landline' },
    voip: { emoji: '💻', label: 'VoIP' },
    unknown: { emoji: '❓', label: 'Unknown' }
  };

  return types[lineType?.toLowerCase()] || types.unknown;
}

import { describe, test, expect, jest, beforeEach } from '@jest/globals';

// Mock Twilio before importing the utility
const mockFetch = jest.fn();
jest.unstable_mockModule('twilio', () => {
  return {
    default: jest.fn(() => ({
      lookups: {
        v2: {
          phoneNumbers: jest.fn((number) => ({
            fetch: mockFetch
          }))
        }
      }
    }))
  };
});

// Import the utility after mocking
const { lookupCaller, getCachedLookup, formatLineType } = await import('../../api/utils/twilio-lookup.js');

describe('Twilio Lookup Utility', () => {
  let mockRedis;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();

    // Mock Redis client
    mockRedis = {
      get: jest.fn(),
      setex: jest.fn(),
      set: jest.fn()
    };

    // Set up environment variables
    process.env.TWILIO_ACCOUNT_SID = 'ACtest123';
    process.env.TWILIO_AUTH_TOKEN = 'test_auth_token';
    process.env.TWILIO_LOOKUP_ENABLED = 'true';
  });

  describe('lookupCaller', () => {
    test('returns cached data if available', async () => {
      const cachedData = {
        phoneNumber: '+13055551234',
        callerName: 'John Doe',
        lineType: 'mobile',
        carrierName: 'T-Mobile',
        lastUpdated: '2025-11-08T12:00:00Z'
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(cachedData));

      const result = await lookupCaller('+13055551234', mockRedis, false);

      expect(result).toEqual(cachedData);
      expect(mockRedis.get).toHaveBeenCalledWith('lookup:+13055551234');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test('performs API call on cache miss', async () => {
      mockRedis.get.mockResolvedValue(null);

      const apiResponse = {
        phoneNumber: '+13055551234',
        callerName: {
          caller_name: 'Jane Smith',
          caller_type: 'BUSINESS'
        },
        lineTypeIntelligence: {
          type: 'mobile',
          carrier_name: 'Verizon',
          mobile_country_code: '310',
          mobile_network_code: '410'
        }
      };

      mockFetch.mockResolvedValue(apiResponse);

      const result = await lookupCaller('+13055551234', mockRedis, false);

      expect(mockFetch).toHaveBeenCalledWith({ fields: 'caller_name,line_type_intelligence' });
      expect(result.callerName).toBe('Jane Smith');
      expect(result.lineType).toBe('mobile');
      expect(result.carrierName).toBe('Verizon');

      // Should cache the result
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'lookup:+13055551234',
        2592000, // 30 days
        expect.any(String)
      );
    });

    test('bypasses cache when forceRefresh is true', async () => {
      const cachedData = {
        phoneNumber: '+13055551234',
        callerName: 'Old Name',
        lineType: 'landline'
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(cachedData));

      const apiResponse = {
        phoneNumber: '+13055551234',
        callerName: {
          caller_name: 'New Name',
          caller_type: 'CONSUMER'
        },
        lineTypeIntelligence: {
          type: 'mobile',
          carrier_name: 'AT&T'
        }
      };

      mockFetch.mockResolvedValue(apiResponse);

      const result = await lookupCaller('+13055551234', mockRedis, true);

      expect(mockFetch).toHaveBeenCalled();
      expect(result.callerName).toBe('New Name');
      expect(result.lineType).toBe('mobile');
    });

    test('returns null when feature is disabled', async () => {
      process.env.TWILIO_LOOKUP_ENABLED = 'false';

      const result = await lookupCaller('+13055551234', mockRedis, false);

      expect(result).toBeNull();
      expect(mockRedis.get).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test('returns null when credentials are missing', async () => {
      delete process.env.TWILIO_ACCOUNT_SID;

      const result = await lookupCaller('+13055551234', mockRedis, false);

      expect(result).toBeNull();
    });

    test('returns null when phone number is invalid', async () => {
      const result = await lookupCaller('', mockRedis, false);

      expect(result).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test('handles API errors gracefully', async () => {
      mockRedis.get.mockResolvedValue(null);

      const error = new Error('Invalid phone number');
      error.status = 404;
      error.code = 20404;

      mockFetch.mockRejectedValue(error);

      const result = await lookupCaller('+13055551234', mockRedis, false);

      expect(result).toBeNull();

      // Should cache failure for 1 hour to avoid repeated lookups
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'lookup:+13055551234',
        3600, // 1 hour
        expect.stringContaining('lookupFailed')
      );
    });

    test('normalizes phone numbers to E.164 format', async () => {
      mockRedis.get.mockResolvedValue(null);

      const apiResponse = {
        phoneNumber: '+13055551234',
        lineTypeIntelligence: { type: 'mobile' }
      };

      mockFetch.mockResolvedValue(apiResponse);

      await lookupCaller('3055551234', mockRedis, false);

      expect(mockRedis.get).toHaveBeenCalledWith('lookup:+3055551234');
    });

    test('handles missing optional fields', async () => {
      mockRedis.get.mockResolvedValue(null);

      const apiResponse = {
        phoneNumber: '+13055551234',
        // No callerName or lineTypeIntelligence
      };

      mockFetch.mockResolvedValue(apiResponse);

      const result = await lookupCaller('+13055551234', mockRedis, false);

      expect(result.callerName).toBeNull();
      expect(result.lineType).toBe('unknown');
      expect(result.carrierName).toBeNull();
    });
  });

  describe('getCachedLookup', () => {
    test('returns cached data if available', async () => {
      const cachedData = {
        phoneNumber: '+13055551234',
        callerName: 'Test User',
        lineType: 'voip'
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(cachedData));

      const result = await getCachedLookup('+13055551234', mockRedis);

      expect(result).toEqual(cachedData);
      expect(mockRedis.get).toHaveBeenCalledWith('lookup:+13055551234');
    });

    test('returns null if cache is empty', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await getCachedLookup('+13055551234', mockRedis);

      expect(result).toBeNull();
    });

    test('returns null if phone number is missing', async () => {
      const result = await getCachedLookup(null, mockRedis);

      expect(result).toBeNull();
      expect(mockRedis.get).not.toHaveBeenCalled();
    });

    test('returns null if redis is not available', async () => {
      const result = await getCachedLookup('+13055551234', null);

      expect(result).toBeNull();
    });

    test('handles errors gracefully', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis error'));

      const result = await getCachedLookup('+13055551234', mockRedis);

      expect(result).toBeNull();
    });
  });

  describe('formatLineType', () => {
    test('formats mobile line type', () => {
      const result = formatLineType('mobile');

      expect(result.emoji).toBe('📱');
      expect(result.label).toBe('Mobile');
    });

    test('formats landline line type', () => {
      const result = formatLineType('landline');

      expect(result.emoji).toBe('☎️');
      expect(result.label).toBe('Landline');
    });

    test('formats voip line type', () => {
      const result = formatLineType('voip');

      expect(result.emoji).toBe('💻');
      expect(result.label).toBe('VoIP');
    });

    test('handles unknown line type', () => {
      const result = formatLineType('unknown');

      expect(result.emoji).toBe('❓');
      expect(result.label).toBe('Unknown');
    });

    test('handles null line type', () => {
      const result = formatLineType(null);

      expect(result.emoji).toBe('❓');
      expect(result.label).toBe('Unknown');
    });

    test('handles case-insensitive input', () => {
      const result = formatLineType('MOBILE');

      expect(result.emoji).toBe('📱');
      expect(result.label).toBe('Mobile');
    });

    test('defaults to unknown for unrecognized types', () => {
      const result = formatLineType('satellite');

      expect(result.emoji).toBe('❓');
      expect(result.label).toBe('Unknown');
    });
  });
});

import { describe, test, expect, jest, beforeAll, beforeEach } from '@jest/globals';
import { createMocks } from 'node-mocks-http';

// Stable mock reference - shared between the factory closure and individual tests
// so each test can control what conferences.list() returns via mockResolvedValue / mockRejectedValue
const mockConferencesList = jest.fn();

// Minimal VoiceResponse that writes attributes as-is to XML.
// We only need the `action` attribute on <Record>, so a thin stub is enough.
class MockVoiceResponse {
  constructor() { this._record = null; }
  say() { return this; }
  record(attrs) { this._record = attrs; return this; }
  hangup() { return this; }
  toString() {
    if (!this._record) return '<Response/>';
    const attrs = Object.entries(this._record)
      .filter(([, v]) => v !== undefined && !Array.isArray(v))
      .map(([k, v]) => `${k}="${v}"`)
      .join(' ');
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Record ${attrs}/></Response>`;
  }
}

jest.unstable_mockModule('twilio', () => {
  const MockTwilio = jest.fn(() => ({
    conferences: { list: mockConferencesList }
  }));
  MockTwilio.twiml = { VoiceResponse: MockVoiceResponse };

  return { default: MockTwilio };
});

describe('resolveOriginalCaller (via voicemail handler)', () => {
  let handler;

  beforeAll(async () => {
    // Must import after jest.unstable_mockModule so voicemail.js gets the mocked twilio
    handler = (await import('../../api/twilio/voicemail.js')).default;
  });

  beforeEach(() => {
    mockConferencesList.mockReset();
    mockConferencesList.mockResolvedValue([]); // safe default: no conferences

    process.env.TWILIO_ACCOUNT_SID = 'ACtest';
    process.env.TWILIO_AUTH_TOKEN = 'test-auth-token';
    process.env.BASE_URL = 'https://miami-theater-voice-agent.vercel.app';
  });

  /** POST request that Twilio would send when a call arrives */
  function makeRequest(from = '+12345678901') {
    return createMocks({
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: { From: from, To: '+19876543210', CallSid: 'CAxxxxx' }
    });
  }

  /**
   * Parse the original_from query param out of the <Record action="..."> URL.
   * ElevenLabs embeds it as ?original_from=%2B... so we URL-decode on the way out.
   */
  function extractOriginalFrom(twiml) {
    const match = /action="[^"]*[?&]original_from=([^"&]*)/.exec(twiml);
    return match ? decodeURIComponent(match[1]) : null;
  }

  test('extracts phone number from an ElevenLabs transfer conference name', async () => {
    mockConferencesList.mockResolvedValue([
      { friendlyName: 'transfer_customer_+14155551234_CAabc123def456' }
    ]);

    const { req, res } = makeRequest('+10000000000'); // From is ElevenLabs' number
    await handler(req, res);

    expect(extractOriginalFrom(res._getData())).toBe('+14155551234');
  });

  test('picks the matching conference when multiple are active', async () => {
    mockConferencesList.mockResolvedValue([
      { friendlyName: 'weekly_standup' },
      { friendlyName: 'transfer_customer_+19175550123_CAxyz789' },
      { friendlyName: 'some_other_call' }
    ]);

    const { req, res } = makeRequest('+10000000000');
    await handler(req, res);

    expect(extractOriginalFrom(res._getData())).toBe('+19175550123');
  });

  test('falls back to From when no transfer_customer_ conference is active', async () => {
    mockConferencesList.mockResolvedValue([
      { friendlyName: 'weekly_standup' },
      { friendlyName: 'regular_call_123' }
    ]);

    const { req, res } = makeRequest('+12345678901');
    await handler(req, res);

    expect(extractOriginalFrom(res._getData())).toBe('+12345678901');
  });

  test('falls back to From when conference list is empty', async () => {
    mockConferencesList.mockResolvedValue([]);

    const { req, res } = makeRequest('+12345678901');
    await handler(req, res);

    expect(extractOriginalFrom(res._getData())).toBe('+12345678901');
  });

  test('falls back to From when the Twilio conference API throws', async () => {
    mockConferencesList.mockRejectedValue(new Error('Twilio API unavailable'));

    const { req, res } = makeRequest('+12345678901');
    await handler(req, res);

    // Error must be swallowed - handler still returns valid TwiML
    expect(res._getStatusCode()).toBe(200);
    expect(extractOriginalFrom(res._getData())).toBe('+12345678901');
  });

  test('falls back to From when conference name has no phone number after the prefix', async () => {
    // Pattern requires /\+(\d+)_/ — names without a + won't match
    mockConferencesList.mockResolvedValue([
      { friendlyName: 'transfer_customer_malformed_no_plus_sign' }
    ]);

    const { req, res } = makeRequest('+12345678901');
    await handler(req, res);

    expect(extractOriginalFrom(res._getData())).toBe('+12345678901');
  });

  test('always returns 200 with valid TwiML containing a Record action URL', async () => {
    mockConferencesList.mockResolvedValue([]);

    const { req, res } = makeRequest();
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getHeaders()['content-type']).toContain('text/xml');

    const twiml = res._getData();
    expect(twiml).toContain('<Record');
    expect(twiml).toContain('original_from=');
  });
});

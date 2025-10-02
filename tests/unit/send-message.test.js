import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import httpMocks from 'node-mocks-http';

// Mock the Resend module before importing the handler
const mockSend = jest.fn();
jest.unstable_mockModule('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: {
      send: mockSend
    }
  }))
}));

// Import the handler after mocking
const { default: handler } = await import('../../api/send-message.js');

describe('send-message API', () => {
  let req, res;

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
    mockSend.mockReset();

    // Set up environment variables
    process.env.RESEND_API_KEY = 'test-api-key';
    process.env.OCINEMA_EMAIL = 'info@ocinema.org';
    process.env.RESEND_FROM_EMAIL = 'voice-agent@ocinema.org';

    // Create fresh mock req/res objects
    req = httpMocks.createRequest();
    res = httpMocks.createResponse();
  });

  describe('CORS handling', () => {
    test('handles OPTIONS preflight request', async () => {
      req.method = 'OPTIONS';

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res._getHeaders()['access-control-allow-origin']).toBe('*');
      expect(res._getHeaders()['access-control-allow-methods']).toBe('GET, POST, OPTIONS');
      expect(res._getHeaders()['access-control-allow-headers']).toBe('Content-Type, Authorization');
    });
  });

  describe('method validation', () => {
    test('rejects GET requests', async () => {
      req.method = 'GET';

      await handler(req, res);

      expect(res.statusCode).toBe(405);
      const data = JSON.parse(res._getData());
      expect(data.error).toBe('Method not allowed');
      expect(data.conversational_response).toContain('technical issue');
    });

    test('rejects PUT requests', async () => {
      req.method = 'PUT';

      await handler(req, res);

      expect(res.statusCode).toBe(405);
      const data = JSON.parse(res._getData());
      expect(data.error).toBe('Method not allowed');
    });
  });

  describe('message validation', () => {
    test('rejects request with missing message', async () => {
      req.method = 'POST';
      req.body = {
        caller_name: 'John Doe',
        caller_phone: '305-555-1234'
      };

      await handler(req, res);

      expect(res.statusCode).toBe(400);
      const data = JSON.parse(res._getData());
      expect(data.error).toBe('Message is required');
      expect(data.conversational_response).toContain("didn't catch your message");
    });

    test('rejects request with empty message', async () => {
      req.method = 'POST';
      req.body = {
        message: '   ',
        caller_name: 'John Doe'
      };

      await handler(req, res);

      expect(res.statusCode).toBe(400);
      const data = JSON.parse(res._getData());
      expect(data.error).toBe('Message is required');
    });
  });

  describe('configuration validation', () => {
    test('returns error when RESEND_API_KEY is missing', async () => {
      delete process.env.RESEND_API_KEY;

      req.method = 'POST';
      req.body = {
        message: 'Test message'
      };

      await handler(req, res);

      expect(res.statusCode).toBe(500);
      const data = JSON.parse(res._getData());
      expect(data.error).toBe('Email service not configured');
      expect(data.conversational_response).toContain('unable to send your message');
    });

    test('returns error when OCINEMA_EMAIL is missing', async () => {
      delete process.env.OCINEMA_EMAIL;

      req.method = 'POST';
      req.body = {
        message: 'Test message'
      };

      await handler(req, res);

      expect(res.statusCode).toBe(500);
      const data = JSON.parse(res._getData());
      expect(data.error).toBe('Target email not configured');
      expect(data.conversational_response).toContain('unable to send your message');
    });
  });

  describe('successful message sending', () => {
    test('sends email with all fields provided', async () => {
      mockSend.mockResolvedValue({
        data: { id: 'email-123' },
        error: null
      });

      req.method = 'POST';
      req.body = {
        caller_name: 'John Doe',
        caller_phone: '305-555-1234',
        message: 'I would like to inquire about group bookings',
        context: 'Asking about showtimes'
      };

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res._getData());

      expect(data.success).toBe(true);
      expect(data.email_id).toBe('email-123');
      expect(data.conversational_response).toContain('Thank you, John Doe');
      expect(data.conversational_response).toContain('Your message has been sent');
      expect(data.message_info.caller_name).toBe('John Doe');
      expect(data.message_info.has_phone).toBe(true);
      expect(data.message_info.sent_at).toBeTruthy();

      // Verify email was sent with correct parameters
      expect(mockSend).toHaveBeenCalledTimes(1);
      const emailCall = mockSend.mock.calls[0][0];
      expect(emailCall.to).toBe('info@ocinema.org');
      expect(emailCall.from).toBe('voice-agent@ocinema.org');
      expect(emailCall.subject).toBe('Voice Agent Message from John Doe');
      expect(emailCall.html).toContain('John Doe');
      expect(emailCall.html).toContain('305-555-1234');
      expect(emailCall.html).toContain('I would like to inquire about group bookings');
      expect(emailCall.html).toContain('Asking about showtimes');
      expect(emailCall.text).toContain('I would like to inquire about group bookings');
      expect(emailCall.replyTo).toBe('305-555-1234');
    });

    test('sends email with only message (minimal fields)', async () => {
      mockSend.mockResolvedValue({
        data: { id: 'email-456' },
        error: null
      });

      req.method = 'POST';
      req.body = {
        message: 'What are your hours?'
      };

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res._getData());

      expect(data.success).toBe(true);
      expect(data.email_id).toBe('email-456');
      expect(data.conversational_response).toContain('Thank you');
      expect(data.conversational_response).not.toContain('Thank you,'); // No comma when no name
      expect(data.message_info.caller_name).toBe('Anonymous');
      expect(data.message_info.has_phone).toBe(false);

      // Verify email structure
      expect(mockSend).toHaveBeenCalledTimes(1);
      const emailCall = mockSend.mock.calls[0][0];
      expect(emailCall.subject).toBe('Voice Agent Message');
      expect(emailCall.html).toContain('What are your hours?');
      expect(emailCall.html).not.toContain('Caller Name:');
      expect(emailCall.html).not.toContain('Phone Number:');
      expect(emailCall.replyTo).toBeUndefined();
    });

    test('uses default sender email when RESEND_FROM_EMAIL not set', async () => {
      delete process.env.RESEND_FROM_EMAIL;

      mockSend.mockResolvedValue({
        data: { id: 'email-789' },
        error: null
      });

      req.method = 'POST';
      req.body = {
        message: 'Test message'
      };

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      const emailCall = mockSend.mock.calls[0][0];
      expect(emailCall.from).toBe('O Cinema Voice Agent <onboarding@resend.dev>');
    });

    test('escapes HTML in message content', async () => {
      mockSend.mockResolvedValue({
        data: { id: 'email-html' },
        error: null
      });

      req.method = 'POST';
      req.body = {
        message: '<script>alert("xss")</script> & other <tags>'
      };

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      const emailCall = mockSend.mock.calls[0][0];
      expect(emailCall.html).toContain('&lt;script&gt;');
      expect(emailCall.html).toContain('&amp;');
      expect(emailCall.html).not.toContain('<script>');
    });
  });

  describe('error handling', () => {
    test('handles Resend API error', async () => {
      mockSend.mockResolvedValue({
        data: null,
        error: { message: 'API error' }
      });

      req.method = 'POST';
      req.body = {
        message: 'Test message'
      };

      await handler(req, res);

      expect(res.statusCode).toBe(500);
      const data = JSON.parse(res._getData());
      expect(data.error).toBe('Failed to send message');
      expect(data.conversational_response).toContain("wasn't able to send your message");
    });

    test('handles unexpected exception', async () => {
      mockSend.mockRejectedValue(new Error('Network failure'));

      req.method = 'POST';
      req.body = {
        message: 'Test message'
      };

      await handler(req, res);

      expect(res.statusCode).toBe(500);
      const data = JSON.parse(res._getData());
      expect(data.error).toBe('Failed to process message');
      expect(data.conversational_response).toContain('issue processing your message');
    });
  });
});

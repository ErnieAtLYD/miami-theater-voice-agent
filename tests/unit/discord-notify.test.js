import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { sendDiscordNotification } from '../../api/utils/discord-notify.js';

// Mock fetch globally
global.fetch = jest.fn();

describe('Discord Notification Utility', () => {
  const mockWebhookUrl = 'https://discord.com/api/webhooks/123456/abcdef';
  const originalEnv = process.env.DISCORD_WEBHOOK_URL;

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Set up default successful mock response
    global.fetch.mockResolvedValue({
      ok: true,
      status: 204,
      text: async () => ''
    });

    // Set webhook URL
    process.env.DISCORD_WEBHOOK_URL = mockWebhookUrl;
  });

  afterEach(() => {
    // Restore original environment
    process.env.DISCORD_WEBHOOK_URL = originalEnv;
  });

  describe('sendDiscordNotification', () => {
    test('should throw error when DISCORD_WEBHOOK_URL is not configured', async () => {
      delete process.env.DISCORD_WEBHOOK_URL;

      const voicemail = {
        id: 'RE123',
        from: '+1234567890',
        duration: 45,
        createdAt: new Date().toISOString(),
        recordingUrl: 'https://example.com/recording.wav'
      };

      await expect(sendDiscordNotification(voicemail, 'new')).rejects.toThrow(
        'DISCORD_WEBHOOK_URL not configured'
      );
    });

    test('should throw when webhook URL missing', async () => {
      const voicemail = {
        id: 'RE123',
        from: '+1234567890',
        duration: 45,
        createdAt: new Date().toISOString(),
        recordingUrl: 'https://example.com/recording.wav'
      };

      // Test with undefined (deleted variable)
      delete process.env.DISCORD_WEBHOOK_URL;
      await expect(sendDiscordNotification(voicemail, 'new')).rejects.toThrow(
        'DISCORD_WEBHOOK_URL not configured'
      );

      // Test with empty string
      process.env.DISCORD_WEBHOOK_URL = '';
      await expect(sendDiscordNotification(voicemail, 'new')).rejects.toThrow(
        'DISCORD_WEBHOOK_URL not configured'
      );

      // Test works for both notification types
      delete process.env.DISCORD_WEBHOOK_URL;
      await expect(sendDiscordNotification(voicemail, 'transcription')).rejects.toThrow(
        'DISCORD_WEBHOOK_URL not configured'
      );
    });

    test('should send POST request to Discord webhook', async () => {
      const voicemail = {
        id: 'RE123',
        from: '+1234567890',
        duration: 45,
        createdAt: new Date().toISOString(),
        recordingUrl: 'https://example.com/recording.wav'
      };

      await sendDiscordNotification(voicemail, 'new');

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledWith(
        mockWebhookUrl,
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: expect.any(String)
        })
      );
    });

    test('should throw error when webhook request fails', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => 'Bad Request'
      });

      const voicemail = {
        id: 'RE123',
        from: '+1234567890',
        duration: 45,
        createdAt: new Date().toISOString(),
        recordingUrl: 'https://example.com/recording.wav'
      };

      await expect(sendDiscordNotification(voicemail, 'new')).rejects.toThrow(
        'Discord webhook failed: 400 Bad Request'
      );
    });

    test('should log success message on successful notification', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const voicemail = {
        id: 'RE123',
        from: '+1234567890',
        duration: 45,
        createdAt: new Date().toISOString(),
        recordingUrl: 'https://example.com/recording.wav'
      };

      await sendDiscordNotification(voicemail, 'new');

      expect(consoleSpy).toHaveBeenCalledWith('Discord notification sent successfully (new)');

      consoleSpy.mockRestore();
    });
  });

  describe('New Voicemail Payload', () => {
    test('should build payload with required fields', async () => {
      const voicemail = {
        id: 'RE123',
        from: '+1234567890',
        duration: 45,
        createdAt: '2024-01-15T10:30:00.000Z',
        recordingUrl: 'https://example.com/recording.wav'
      };

      await sendDiscordNotification(voicemail, 'new');

      const callArgs = global.fetch.mock.calls[0];
      const payload = JSON.parse(callArgs[1].body);

      expect(payload.content).toBe('📞 **New voicemail received!**');
      expect(payload.embeds).toHaveLength(1);
      expect(payload.embeds[0].title).toBe('📬 New Voicemail Message');
      expect(payload.embeds[0].color).toBe(5814783); // Blue color
      expect(payload.embeds[0].footer.text).toBe('O Cinema Voicemail System');
      expect(payload.embeds[0].timestamp).toBe(voicemail.createdAt);
    });

    test('should include phone number, duration, and recording link in fields', async () => {
      const voicemail = {
        id: 'RE123',
        from: '+1234567890',
        duration: 45,
        createdAt: '2024-01-15T10:30:00.000Z',
        recordingUrl: 'https://example.com/recording.wav'
      };

      await sendDiscordNotification(voicemail, 'new');

      const callArgs = global.fetch.mock.calls[0];
      const payload = JSON.parse(callArgs[1].body);
      const fields = payload.embeds[0].fields;

      // Should have: From, Duration, Received, Recording
      expect(fields.length).toBeGreaterThanOrEqual(4);

      const fromField = fields.find(f => f.name === '📱 From');
      expect(fromField.value).toBe('+1234567890');

      const durationField = fields.find(f => f.name === '⏱️ Duration');
      expect(durationField.value).toBe('45s');

      const recordingField = fields.find(f => f.name === '🎧 Recording');
      expect(recordingField.value).toBe('[Listen to recording](https://example.com/recording.wav)');
    });

    test('should format duration with minutes and seconds', async () => {
      const voicemail = {
        id: 'RE123',
        from: '+1234567890',
        duration: 125, // 2 minutes 5 seconds
        createdAt: '2024-01-15T10:30:00.000Z',
        recordingUrl: 'https://example.com/recording.wav'
      };

      await sendDiscordNotification(voicemail, 'new');

      const callArgs = global.fetch.mock.calls[0];
      const payload = JSON.parse(callArgs[1].body);
      const durationField = payload.embeds[0].fields.find(f => f.name === '⏱️ Duration');

      expect(durationField.value).toBe('2m 5s');
    });

    test('should include caller name when available', async () => {
      const voicemail = {
        id: 'RE123',
        from: '+1234567890',
        callerName: 'John Doe',
        duration: 45,
        createdAt: '2024-01-15T10:30:00.000Z',
        recordingUrl: 'https://example.com/recording.wav'
      };

      await sendDiscordNotification(voicemail, 'new');

      const callArgs = global.fetch.mock.calls[0];
      const payload = JSON.parse(callArgs[1].body);
      const callerNameField = payload.embeds[0].fields.find(f => f.name === '👤 Caller');

      expect(callerNameField).toBeDefined();
      expect(callerNameField.value).toBe('John Doe');
      expect(callerNameField.inline).toBe(true);
    });

    test('should not include caller name field when not available', async () => {
      const voicemail = {
        id: 'RE123',
        from: '+1234567890',
        duration: 45,
        createdAt: '2024-01-15T10:30:00.000Z',
        recordingUrl: 'https://example.com/recording.wav'
      };

      await sendDiscordNotification(voicemail, 'new');

      const callArgs = global.fetch.mock.calls[0];
      const payload = JSON.parse(callArgs[1].body);
      const callerNameField = payload.embeds[0].fields.find(f => f.name === '👤 Caller');

      expect(callerNameField).toBeUndefined();
    });
  });

  describe('Transcription Payload', () => {
    test('should build payload with transcription type', async () => {
      const voicemail = {
        id: 'RE123',
        from: '+1234567890',
        duration: 45,
        createdAt: '2024-01-15T10:30:00.000Z',
        recordingUrl: 'https://example.com/recording.wav',
        transcription: 'Hello, this is a test voicemail message.'
      };

      await sendDiscordNotification(voicemail, 'transcription');

      const callArgs = global.fetch.mock.calls[0];
      const payload = JSON.parse(callArgs[1].body);

      expect(payload.content).toBe('📝 **Voicemail transcription ready!**');
      expect(payload.embeds).toHaveLength(1);
      expect(payload.embeds[0].title).toBe('✅ Transcription Available');
      expect(payload.embeds[0].color).toBe(3066993); // Green color
    });

    test('should include transcription text in fields', async () => {
      const transcriptionText = 'Hello, this is a test voicemail message about theater showtimes.';
      const voicemail = {
        id: 'RE123',
        from: '+1234567890',
        duration: 45,
        createdAt: '2024-01-15T10:30:00.000Z',
        recordingUrl: 'https://example.com/recording.wav',
        transcription: transcriptionText
      };

      await sendDiscordNotification(voicemail, 'transcription');

      const callArgs = global.fetch.mock.calls[0];
      const payload = JSON.parse(callArgs[1].body);
      const transcriptionField = payload.embeds[0].fields.find(f => f.name === '📝 Transcription');

      expect(transcriptionField).toBeDefined();
      expect(transcriptionField.value).toBe(transcriptionText);
    });

    test('should truncate long transcriptions at 1000 chars', async () => {
      // Create a transcription longer than 1000 characters
      const longTranscription = 'A'.repeat(1500);

      const voicemail = {
        id: 'RE123',
        from: '+1234567890',
        duration: 45,
        createdAt: '2024-01-15T10:30:00.000Z',
        recordingUrl: 'https://example.com/recording.wav',
        transcription: longTranscription
      };

      await sendDiscordNotification(voicemail, 'transcription');

      const callArgs = global.fetch.mock.calls[0];
      const payload = JSON.parse(callArgs[1].body);
      const transcriptionField = payload.embeds[0].fields.find(f => f.name === '📝 Transcription');

      // Should be truncated to 997 chars + '...' = 1000 total
      expect(transcriptionField.value).toBe('A'.repeat(997) + '...');
      expect(transcriptionField.value.length).toBe(1000);
    });

    test('should not truncate short transcriptions', async () => {
      const shortTranscription = 'This is a short message.';

      const voicemail = {
        id: 'RE123',
        from: '+1234567890',
        duration: 45,
        createdAt: '2024-01-15T10:30:00.000Z',
        recordingUrl: 'https://example.com/recording.wav',
        transcription: shortTranscription
      };

      await sendDiscordNotification(voicemail, 'transcription');

      const callArgs = global.fetch.mock.calls[0];
      const payload = JSON.parse(callArgs[1].body);
      const transcriptionField = payload.embeds[0].fields.find(f => f.name === '📝 Transcription');

      expect(transcriptionField.value).toBe(shortTranscription);
    });

    test('should handle missing transcription with fallback message', async () => {
      const voicemail = {
        id: 'RE123',
        from: '+1234567890',
        duration: 45,
        createdAt: '2024-01-15T10:30:00.000Z',
        recordingUrl: 'https://example.com/recording.wav'
        // No transcription field
      };

      await sendDiscordNotification(voicemail, 'transcription');

      const callArgs = global.fetch.mock.calls[0];
      const payload = JSON.parse(callArgs[1].body);
      const transcriptionField = payload.embeds[0].fields.find(f => f.name === '📝 Transcription');

      expect(transcriptionField.value).toBe('No transcription available');
    });

    test('should include caller name in transcription notification when available', async () => {
      const voicemail = {
        id: 'RE123',
        from: '+1234567890',
        callerName: 'Jane Smith',
        duration: 45,
        createdAt: '2024-01-15T10:30:00.000Z',
        recordingUrl: 'https://example.com/recording.wav',
        transcription: 'Test transcription'
      };

      await sendDiscordNotification(voicemail, 'transcription');

      const callArgs = global.fetch.mock.calls[0];
      const payload = JSON.parse(callArgs[1].body);
      const callerNameField = payload.embeds[0].fields.find(f => f.name === '👤 Caller');

      expect(callerNameField).toBeDefined();
      expect(callerNameField.value).toBe('Jane Smith');
    });
  });

  describe('Edge Cases', () => {
    test('should handle voicemail without recording URL', async () => {
      const voicemail = {
        id: 'RE123',
        from: '+1234567890',
        duration: 45,
        createdAt: '2024-01-15T10:30:00.000Z'
        // No recordingUrl
      };

      await sendDiscordNotification(voicemail, 'new');

      const callArgs = global.fetch.mock.calls[0];
      const payload = JSON.parse(callArgs[1].body);
      const recordingField = payload.embeds[0].fields.find(f => f.name === '🎧 Recording');

      expect(recordingField).toBeUndefined();
    });

    test('should handle zero duration', async () => {
      const voicemail = {
        id: 'RE123',
        from: '+1234567890',
        duration: 0,
        createdAt: '2024-01-15T10:30:00.000Z',
        recordingUrl: 'https://example.com/recording.wav'
      };

      await sendDiscordNotification(voicemail, 'new');

      const callArgs = global.fetch.mock.calls[0];
      const payload = JSON.parse(callArgs[1].body);
      const durationField = payload.embeds[0].fields.find(f => f.name === '⏱️ Duration');

      expect(durationField.value).toBe('0s');
    });

    test('should handle exactly 60 seconds duration', async () => {
      const voicemail = {
        id: 'RE123',
        from: '+1234567890',
        duration: 60,
        createdAt: '2024-01-15T10:30:00.000Z',
        recordingUrl: 'https://example.com/recording.wav'
      };

      await sendDiscordNotification(voicemail, 'new');

      const callArgs = global.fetch.mock.calls[0];
      const payload = JSON.parse(callArgs[1].body);
      const durationField = payload.embeds[0].fields.find(f => f.name === '⏱️ Duration');

      expect(durationField.value).toBe('1m 0s');
    });

    test('should handle exactly 1000 character transcription', async () => {
      const exactTranscription = 'B'.repeat(1000);

      const voicemail = {
        id: 'RE123',
        from: '+1234567890',
        duration: 45,
        createdAt: '2024-01-15T10:30:00.000Z',
        recordingUrl: 'https://example.com/recording.wav',
        transcription: exactTranscription
      };

      await sendDiscordNotification(voicemail, 'transcription');

      const callArgs = global.fetch.mock.calls[0];
      const payload = JSON.parse(callArgs[1].body);
      const transcriptionField = payload.embeds[0].fields.find(f => f.name === '📝 Transcription');

      // Exactly 1000 chars should NOT be truncated
      expect(transcriptionField.value).toBe(exactTranscription);
      expect(transcriptionField.value.length).toBe(1000);
    });

    test('should handle 1001 character transcription', async () => {
      const slightlyLongTranscription = 'C'.repeat(1001);

      const voicemail = {
        id: 'RE123',
        from: '+1234567890',
        duration: 45,
        createdAt: '2024-01-15T10:30:00.000Z',
        recordingUrl: 'https://example.com/recording.wav',
        transcription: slightlyLongTranscription
      };

      await sendDiscordNotification(voicemail, 'transcription');

      const callArgs = global.fetch.mock.calls[0];
      const payload = JSON.parse(callArgs[1].body);
      const transcriptionField = payload.embeds[0].fields.find(f => f.name === '📝 Transcription');

      // 1001 chars should be truncated
      expect(transcriptionField.value).toBe('C'.repeat(997) + '...');
      expect(transcriptionField.value.length).toBe(1000);
    });
  });
});

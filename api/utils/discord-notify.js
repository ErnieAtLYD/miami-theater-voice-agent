// api/utils/discord-notify.js
// Shared utilities for Discord webhook notifications

/**
 * Sends a voicemail notification to Discord
 * @param {Object} voicemail - The voicemail data
 * @param {string} notificationType - Type of notification: 'new' or 'transcription'
 * @returns {Promise<void>}
 * @throws {Error} If Discord webhook fails
 */
export async function sendDiscordNotification(voicemail, notificationType = 'new') {
  // Validate environment variable
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    throw new Error('DISCORD_WEBHOOK_URL not configured');
  }

  const payload = notificationType === 'transcription'
    ? buildTranscriptionPayload(voicemail)
    : buildNewVoicemailPayload(voicemail);

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Discord webhook failed: ${response.status} ${errorText}`);
  }

  console.log(`Discord notification sent successfully (${notificationType})`);
}

/**
 * Builds Discord payload for new voicemail notification
 * @param {Object} voicemail - The voicemail data
 * @returns {Object} Discord webhook payload
 */
function buildNewVoicemailPayload(voicemail) {
  const timestamp = new Date(voicemail.createdAt).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });

  // Format duration
  const minutes = Math.floor(voicemail.duration / 60);
  const seconds = voicemail.duration % 60;
  const durationText = minutes > 0
    ? `${minutes}m ${seconds}s`
    : `${seconds}s`;

  // Build embed fields
  const fields = [
    {
      name: '📱 From',
      value: voicemail.from,
      inline: true
    },
    {
      name: '⏱️ Duration',
      value: durationText,
      inline: true
    },
    {
      name: '🕒 Received',
      value: timestamp,
      inline: false
    }
  ];

  // Add caller name if available (from Twilio lookup)
  if (voicemail.callerName) {
    fields.unshift({
      name: '👤 Caller',
      value: voicemail.callerName,
      inline: true
    });
  }

  // Add recording link
  if (voicemail.recordingUrl) {
    fields.push({
      name: '🎧 Recording',
      value: `[Listen to recording](${voicemail.recordingUrl})`,
      inline: false
    });
  }

  return {
    content: '📞 **New voicemail received!**',
    embeds: [{
      title: '📬 New Voicemail Message',
      color: 5814783, // Blue color
      fields: fields,
      footer: {
        text: 'O Cinema Voicemail System'
      },
      timestamp: voicemail.createdAt
    }]
  };
}

/**
 * Builds Discord payload for transcription notification
 * @param {Object} voicemail - The voicemail data
 * @returns {Object} Discord webhook payload
 */
function buildTranscriptionPayload(voicemail) {
  const timestamp = new Date(voicemail.createdAt).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });

  // Truncate transcription if too long (Discord has 1024 char limit per field)
  const transcription = voicemail.transcription || 'No transcription available';
  const truncatedTranscription = transcription.length > 1000
    ? transcription.substring(0, 997) + '...'
    : transcription;

  const fields = [
    {
      name: '📱 From',
      value: voicemail.from,
      inline: true
    },
    {
      name: '🕒 Received',
      value: timestamp,
      inline: true
    },
    {
      name: '📝 Transcription',
      value: truncatedTranscription,
      inline: false
    }
  ];

  // Add caller name if available
  if (voicemail.callerName) {
    fields.splice(1, 0, {
      name: '👤 Caller',
      value: voicemail.callerName,
      inline: true
    });
  }

  // Add recording link
  if (voicemail.recordingUrl) {
    fields.push({
      name: '🎧 Recording',
      value: `[Listen to recording](${voicemail.recordingUrl})`,
      inline: false
    });
  }

  return {
    content: '📝 **Voicemail transcription ready!**',
    embeds: [{
      title: '✅ Transcription Available',
      color: 3066993, // Green color
      fields: fields,
      footer: {
        text: 'O Cinema Voicemail System'
      },
      timestamp: voicemail.createdAt
    }]
  };
}

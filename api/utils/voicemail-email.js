// api/utils/voicemail-email.js
// Shared utilities for voicemail email notifications

/**
 * Escapes HTML special characters to prevent XSS attacks
 * @param {string} unsafe - The unsafe string to escape
 * @returns {string} The HTML-escaped string
 */
export function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Sends a voicemail notification email to staff
 * @param {Object} voicemail - The voicemail data
 * @param {string} emailType - Type of email: 'new' or 'transcription'
 * @returns {Promise<void>}
 * @throws {Error} If email sending fails
 */
export async function sendVoicemailEmail(voicemail, emailType = 'new') {
  // Validate environment variables
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY not configured');
  }
  const staffEmail = process.env.STAFF_EMAIL || process.env.OCINEMA_EMAIL;
  if (!staffEmail) {
    throw new Error('STAFF_EMAIL or OCINEMA_EMAIL not configured');
  }

  // Using Resend API for email delivery
  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);

  const emailData = emailType === 'transcription'
    ? buildTranscriptionEmail(voicemail)
    : buildNewVoicemailEmail(voicemail);

  const { data, error } = await resend.emails.send(emailData);

  if (error) {
    throw new Error(`Resend API error: ${error.message}`);
  }

  console.log(`${emailType} email sent successfully:`, data.id);
  return data;
}

/**
 * Builds email data for new voicemail notification
 * @param {Object} voicemail - The voicemail data
 * @returns {Object} Email data for Resend API
 */
function buildNewVoicemailEmail(voicemail) {
  return {
    from: process.env.FROM_EMAIL || 'O Cinema Voicemail <onboarding@resend.dev>',
    to: process.env.STAFF_EMAIL || process.env.OCINEMA_EMAIL,
    subject: `New Voicemail from ${escapeHtml(voicemail.from)}`,
    html: `
      <h2>New Voicemail Message</h2>
      <p><strong>From:</strong> ${escapeHtml(voicemail.from)}</p>
      <p><strong>Duration:</strong> ${voicemail.duration} seconds</p>
      <p><strong>Received:</strong> ${escapeHtml(new Date(voicemail.createdAt).toLocaleString())}</p>
      <p><strong>Recording:</strong> <a href="${escapeHtml(voicemail.recordingUrl)}">Listen to Recording</a></p>
      ${voicemail.transcription ? `<p><strong>Transcription:</strong><br/>${escapeHtml(voicemail.transcription)}</p>` : '<p><em>Transcription pending...</em></p>'}
      <hr/>
      <p><small>Access all voicemails at: <a href="https://miami-theater-voice-agent.vercel.app/api/voicemail/list">Voicemail Dashboard</a></small></p>
    `
  };
}

/**
 * Builds email data for transcription notification
 * @param {Object} voicemail - The voicemail data
 * @returns {Object} Email data for Resend API
 */
function buildTranscriptionEmail(voicemail) {
  return {
    from: process.env.FROM_EMAIL || 'O Cinema Voicemail <onboarding@resend.dev>',
    to: process.env.STAFF_EMAIL || process.env.OCINEMA_EMAIL,
    subject: `Voicemail Transcription from ${escapeHtml(voicemail.from)}`,
    html: `
      <h2>Voicemail Transcription Available</h2>
      <p><strong>From:</strong> ${escapeHtml(voicemail.from)}</p>
      <p><strong>Duration:</strong> ${voicemail.duration} seconds</p>
      <p><strong>Received:</strong> ${escapeHtml(new Date(voicemail.createdAt).toLocaleString())}</p>
      <hr/>
      <h3>Transcription:</h3>
      <p>${escapeHtml(voicemail.transcription)}</p>
      <hr/>
      <p><strong>Recording:</strong> <a href="${escapeHtml(voicemail.recordingUrl)}">Listen to Recording</a></p>
    `
  };
}

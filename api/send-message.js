// api/send-message.js
// ElevenLabs Client Tool endpoint for sending messages to O Cinema
import { Resend } from 'resend';

export default async function handler(req, res) {
  // Enable CORS for ElevenLabs
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  const escapeHtml = (unsafe) => unsafe.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed',
      conversational_response: 'Sorry, there was a technical issue processing your request.'
    });
  }

  try {
    // Get message details from request body
    const {
      caller_name,
      caller_phone,
      message,
      context // Optional: what they were asking about before leaving message
    } = req.body;

    // Validate required fields
    if (!message || message.trim().length === 0) {
      return res.status(400).json({
        error: 'Message is required',
        conversational_response: "I didn't catch your message. Could you please repeat what you'd like to say?"
      });
    }

    // Initialize Resend
    const resend = new Resend(process.env.RESEND_API_KEY);
    const targetEmail = process.env.OCINEMA_EMAIL;

    if (!process.env.RESEND_API_KEY) {
      console.error('RESEND_API_KEY not configured');
      return res.status(500).json({
        error: 'Email service not configured',
        conversational_response: "I'm sorry, but I'm unable to send your message right now. Please call O Cinema directly or try again later."
      });
    }

    if (!targetEmail) {
      console.error('OCINEMA_EMAIL not configured');
      return res.status(500).json({
        error: 'Target email not configured',
        conversational_response: "I'm sorry, but I'm unable to send your message right now. Please call O Cinema directly or try again later."
      });
    }

    // Format timestamp
    const timestamp = new Date().toLocaleString('en-US', {
      timeZone: 'America/New_York',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    // Build email content
    const emailSubject = caller_name
      ? `Voice Agent Message from ${caller_name}`
      : 'Voice Agent Message';

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">New Message from Voice Agent</h2>

        <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <p style="margin: 10px 0;"><strong>Received:</strong> ${timestamp} (ET)</p>
          ${caller_name ? `<p style="margin: 10px 0;"><strong>Caller Name:</strong> ${escapeHtml(caller_name)}</p>` : ''}
          ${caller_phone ? `<p style="margin: 10px 0;"><strong>Phone Number:</strong> ${escapeHtml(caller_phone)}</p>` : ''}
          ${context ? `<p style="margin: 10px 0;"><strong>Context:</strong> ${escapeHtml(context)}</p>` : ''}
        </div>

        <div style="background-color: #fff; padding: 20px; border-left: 4px solid #0066cc; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #0066cc;">Message:</h3>
          <p style="white-space: pre-wrap; line-height: 1.6;">${escapeHtml(message)}</p>
        </div>

        <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">

        <p style="color: #666; font-size: 12px;">
          This message was automatically sent by the O Cinema Voice Agent system.
        </p>
      </div>
    `;

    const emailText = `
New Message from Voice Agent

Received: ${timestamp} (ET)
${caller_name ? `Caller Name: ${caller_name}` : ''}
${caller_phone ? `Phone Number: ${caller_phone}` : ''}
${context ? `Context: ${context}` : ''}

Message:
${message}

---
This message was automatically sent by the O Cinema Voice Agent system.
    `.trim();

    // Send email via Resend
    const { data, error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'O Cinema Voice Agent <onboarding@resend.dev>',
      to: targetEmail,
      subject: emailSubject,
      html: emailHtml,
      text: emailText,
      replyTo: caller_phone || undefined, // Don't set reply-to if we don't have caller contact
    });

    if (error) {
      console.error('Resend error:', error);
      return res.status(500).json({
        error: 'Failed to send message',
        conversational_response: "I'm sorry, but I wasn't able to send your message. Please try calling O Cinema directly."
      });
    }

    // Success response optimized for voice
    const callerNamePart = caller_name ? `, ${caller_name}` : '';
    const conversationalResponse = `Thank you${callerNamePart}. Your message has been sent to O Cinema's team. Someone will get back to you soon. Is there anything else I can help you with?`;

    return res.status(200).json({
      success: true,
      email_id: data?.id,
      conversational_response: conversationalResponse,
      message_info: {
        sent_at: timestamp,
        caller_name: caller_name || 'Anonymous',
        has_phone: !!caller_phone
      }
    });

  } catch (error) {
    console.error('Send message error:', error);
    return res.status(500).json({
      error: 'Failed to process message',
      conversational_response: "I'm sorry, but there was an issue processing your message. Please try calling O Cinema directly, or try again later."
    });
  }
}

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Vercel-hosted voice agent API for Miami theater showtimes, designed to integrate with ElevenLabs' voice agent system. The application fetches theater data from Agile WebSales and serves it through a REST API optimized for voice interaction.

## Key Commands

- `npm test` - Currently returns error (no tests configured)
- `vercel dev` - Local development with serverless functions
- `vercel deploy` - Deploy to Vercel platform
- Deploy: Uses Vercel for hosting (vercel.json configuration present)

## Architecture

### Core Components

**API Endpoints:**
- `api/showtimes.js` - Main query endpoint for voice agent integration
- `api/send-message.js` - Message forwarding endpoint for customer inquiries
- `api/cron/ingest-showtimes.js` - Automated data ingestion (runs every 30 minutes)
- `api/twilio/voicemail.js` - Twilio TwiML endpoint for voicemail recording
- `api/twilio/voicemail-callback.js` - Handles completed recordings and notifications
- `api/twilio/voicemail-transcription.js` - Processes transcription results
- `api/twilio/recording-status.js` - Handles recording status updates
- `api/voicemail/list.js` - Staff dashboard for viewing voicemails

**Data Flow:**

*Showtimes System:*
1. Cron job fetches from Agile WebSales API every 30 minutes
2. Raw theater data is processed and cached in Upstash
3. Voice agent queries the processed data through various filters

*Voicemail System:*
1. Caller requests to leave message via ElevenLabs agent
2. Agent invokes "Leave-Voicemail" tool (webhook)
3. Call transfers to Twilio voicemail endpoint
4. Twilio records message (up to 3 minutes) and transcribes
5. Recording completed → callback stores in Redis
6. Email notification sent to staff via Resend
7. Transcription complete → second email with text
8. Staff accesses via dashboard at `/api/voicemail/list`

### Data Structure

**Showtimes Data:**
The application transforms Agile WebSales data into optimized structures:
- `movies` - Array of all available movies with showtimes
- `by_date` - Hash map for date-based queries
- `weekend` - Pre-filtered Friday/Saturday/Sunday showtimes
- `upcoming` - Next 7 days of showtimes

**Voicemail Data:**
Stored in Redis with the following structure:
- `voicemails:index` - Sorted set of voicemail IDs by timestamp
- `voicemail:{RecordingSid}` - Individual voicemail records containing:
  - Recording URL and duration
  - Caller information (from, to, callSid)
  - Transcription text (when available)
  - Status and timestamps
  - Listen status (listened/unlistened)

### Query Parameters

The showtimes API supports:
- `date` - Specific date lookup (YYYY-MM-DD)
- `movie_title` - Movie name search (partial matching)
- `day_type` - 'weekend', 'today', 'tomorrow'
- `time_preference` - 'evening', 'afternoon', 'night'

### Environment Variables

**Required for production:**
- `CRON_SECRET` - Secures the cron endpoint
- `AGILE_GUID` - Agile WebSales API identifier
- Upstash Redis credentials:
  - `UPSTASH_REDIS_REST_URL` or `KV_REST_API_URL` - Redis connection URL
  - `UPSTASH_REDIS_REST_TOKEN` or `KV_REST_API_TOKEN` - Redis authentication token
- Email service (Resend):
  - `RESEND_API_KEY` - Resend API authentication key
  - `OCINEMA_EMAIL` - Target email address for customer messages
  - `RESEND_FROM_EMAIL` - (Optional) Sender email address (defaults to onboarding@resend.dev)

**Required for voicemail system:**
- `TWILIO_ACCOUNT_SID` - Twilio account identifier
- `TWILIO_AUTH_TOKEN` - Twilio authentication token
- `RESEND_API_KEY` - Resend API key for email notifications
- `STAFF_EMAIL` - Email address to receive voicemail notifications
- `FROM_EMAIL` - Sender email address (optional, defaults to onboarding@resend.dev)

### Voice Agent Integration

The API is specifically designed for ElevenLabs voice agents:
- CORS headers enabled for cross-origin requests
- Data formatted with human-readable summaries for text-to-speech
- Time formatting optimized for voice pronunciation
- Structured responses with summary fields for natural conversation

### Voicemail Integration

The voicemail system integrates ElevenLabs conversational AI with Twilio recording:

**ElevenLabs Tool Configuration:**
- Tool type: Webhook
- Tool name: "Leave-Voicemail"
- Invoked when: Caller wants to speak to staff or leave a message
- Tool configuration: `elevenlabs/voicemail-tool-config.json`

**Twilio Recording Features:**
- Maximum recording length: 3 minutes (180 seconds)
- Transcription: Automatic via Twilio
- Finish key: `*` (star key)
- Audio format: WAV/MP3 available
- Callbacks: Recording status, completion, and transcription

**Staff Notification System:**
- Email notifications via Resend
- Immediate notification with recording link
- Follow-up email with transcription (when ready)
- Dashboard access at `/api/voicemail/list`

### Cron Job Security

The ingestion endpoint uses bearer token authentication and should only be called by Vercel's cron system.

### Message Forwarding

The `/api/send-message` endpoint enables voice agent users to leave messages for O Cinema staff:

**IMPORTANT:** This endpoint requires a separate webhook tool configuration in ElevenLabs. The current setup scripts (`setup_agent.py` and `setup_agent.js`) only create the `Miami-Theater-Showtimes` tool. You must manually create a second webhook tool named `Send-Message-To-Cinema` in the ElevenLabs dashboard with:
- URL: `{VERCEL_URL}/api/send-message`
- Method: POST
- Body schema with parameters: `caller_name`, `caller_phone`, `message`, `context`

**Request Format (POST):**
```javascript
{
  "caller_name": "John Doe",          // Optional
  "caller_phone": "(305) 555-1234",   // Optional
  "message": "I'd like to inquire about group bookings",
  "context": "Asking about showtimes" // Optional - what they were doing before
}
```

**Response Format:**
```javascript
{
  "success": true,
  "email_id": "abc123",
  "conversational_response": "Thank you, John. Your message has been sent to O Cinema's team...",
  "message_info": {
    "sent_at": "Monday, January 15, 2024, 3:30 PM",
    "caller_name": "John Doe",
    "has_phone": true
  }
}
```

**Email Integration:**
- Uses Resend for reliable email delivery
- Formatted HTML emails with caller details and timestamp
- Automatic reply-to configuration when phone provided
- Professional formatting for staff review

## Technical Implementation Details

### Upstash Redis Integration

The application uses [@upstash/redis](https://github.com/upstash/redis-js) for serverless Redis connectivity:

```javascript
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});
```

**Key Features:**
- HTTP-based connection ideal for serverless functions
- Automatic caching with `setex()` for TTL support
- JSON serialization for complex data structures
- Development fallback with mock data

**Data Operations:**
- `redis.setex('showtimes:current', 7200, JSON.stringify(data))` - Cache with 2-hour TTL
- `redis.get('showtimes:current')` - Retrieve cached showtimes
- `redis.get('showtimes:last_updated')` - Track data freshness

### Vercel Serverless Functions

The API endpoints are deployed as Vercel serverless functions:

```javascript
export default async function handler(req, res) {
  // CORS headers for ElevenLabs integration
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Function logic here
}
```

**Cron Job Configuration (vercel.json):**
```json
{
  "crons": [
    {
      "path": "/api/cron/ingest-showtimes",
      "schedule": "*/30 * * * *"
    }
  ]
}
```

### ElevenLabs Voice Agent Integration

The API is optimized for ElevenLabs conversational AI:

**Current Limitations:** The ElevenLabs setup scripts in `/elevenlabs/` only configure the showtimes query tool. The message forwarding functionality (`/api/send-message`) is documented but not yet integrated into the automated setup. Manual configuration required in ElevenLabs dashboard.

**Response Format:**
```javascript
{
  movie_title: "The Substance",
  date: "2024-01-15",
  time: "7:30 PM",
  theater: "O Cinema South Beach",
  rating: "R",
  runtime: 140,
  special_format: "IMAX, 3D",
  // Human-readable summary for voice synthesis
  summary: "The Substance is showing on Monday, January 15th at 7:30 PM in O Cinema South Beach"
}
```

**Voice-Optimized Features:**
- Date formatting with `toLocaleDateString()` for natural speech
- Time parsing optimized for voice pronunciation
- Summary fields provide context for conversational flow
- CORS enabled for cross-origin voice agent requests

### Twilio Voicemail Integration

The application uses [twilio](https://github.com/twilio/twilio-node) for TwiML generation and voicemail recording:

```javascript
import twilio from 'twilio';
const { twiml } = twilio;

const voiceResponse = new twiml.VoiceResponse();
voiceResponse.say('Please leave a message after the beep.');
voiceResponse.record({
  maxLength: 180,
  finishOnKey: '*',
  transcribe: true,
  transcribeCallback: '/api/twilio/voicemail-transcription',
  action: '/api/twilio/voicemail-callback'
});
```

**Recording Workflow:**
1. ElevenLabs agent invokes Leave-Voicemail tool
2. `/api/twilio/voicemail` returns TwiML with `<Record>` verb
3. Twilio records caller's message and generates transcription
4. Recording complete → POST to `/api/twilio/voicemail-callback`
5. Callback stores voicemail in Redis sorted set
6. Resend email sent to staff with recording link
7. Transcription complete → POST to `/api/twilio/voicemail-transcription`
8. Voicemail record updated with transcription text
9. Second email sent with full transcription

**Voicemail Storage Structure:**
```javascript
{
  id: "RExxxxx",                    // Twilio RecordingSid
  recordingUrl: "https://...",      // Audio file URL
  duration: 45,                     // Duration in seconds
  from: "+1234567890",              // Caller's phone number
  transcription: "Hello, I...",     // Transcription text
  createdAt: "2024-01-15T...",      // ISO timestamp
  listened: false                    // Staff listen status
}
```

**Staff Dashboard:**
- Access: `/api/voicemail/list`
- Features: Listen to recordings, view transcriptions, download MP3s
- Data source: Redis sorted set `voicemails:index`
- Display: HTML UI with responsive design or JSON API

### Development Workflow

**Local Development:**
1. Set environment variables in `.env`
2. Run `vercel dev` for local serverless function testing
3. Mock data automatically served when Redis unavailable

**Deployment:**
1. Environment variables configured in Vercel dashboard
2. Automatic deployment on git push
3. Cron jobs automatically scheduled via vercel.json

**Error Handling:**
- Graceful Redis connection fallbacks
- Development mock data when external APIs unavailable
- Structured error responses with appropriate HTTP status codes
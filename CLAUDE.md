# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Vercel-hosted voice agent API for Miami theater showtimes, designed to integrate with ElevenLabs' voice agent system. The application fetches theater data from Agile WebSales and serves it through a REST API optimized for voice interaction.

## Key Commands

- `npm test` - Run all tests (unit + integration)
- `npm run test:unit` - Run unit tests only
- `npm run test:integration` - Run integration tests only
- `npm run test:coverage` - Run tests with coverage report
- `vercel dev` - Local development with serverless functions
- `vercel deploy` - Deploy to Vercel platform
- Deploy: Uses Vercel for hosting (vercel.json configuration present)

## Architecture

### Core Components

**API Endpoints:**
- `api/showtimes.js` - Main query endpoint for voice agent integration
- `api/cron/ingest-showtimes.js` - Automated data ingestion (runs every 30 minutes)
- `api/twilio/voicemail.js` - Twilio TwiML endpoint for voicemail recording
- `api/twilio/voicemail-callback.js` - Handles completed recordings and notifications
- `api/twilio/voicemail-transcription.js` - Processes transcription results
- `api/twilio/recording-status.js` - Handles recording status updates
- `api/voicemail/list.js` - Staff API/dashboard for viewing voicemails (API + HTML)
- `api/voicemail/dashboard.js` - Password-protected web dashboard for staff
- `api/voicemail/delete.js` - Authenticated DELETE endpoint for removing voicemails

**Data Flow:**

*Showtimes System:*
1. Cron job fetches from Agile WebSales API every 30 minutes
2. Raw theater data is processed and cached in Upstash
3. Voice agent queries the processed data through various filters

*Voicemail System:*
**Note:** Twilio voicemail endpoints are accessed directly by a configured Twilio phone number, NOT via ElevenLabs webhook. ElevenLabs agents have native call transfer capabilities - use those instead of building custom webhook tools for call routing.

1. Caller dials Twilio phone number configured to use voicemail endpoint
2. Twilio invokes `/api/twilio/voicemail` and receives TwiML instructions
3. Twilio records message (up to 3 minutes) and transcribes
4. Recording completed → callback stores in Redis
5. Email notification sent to staff via Resend
6. Discord notification sent to configured webhook (if enabled)
7. Transcription complete → second email and Discord notification with text
8. Staff accesses via dashboard at `/api/voicemail/list`
9. Staff can delete voicemails via dashboard to manage storage

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

**Naming Convention & Precedence:**

The application supports multiple environment variable naming conventions for Redis to work seamlessly with different hosting platforms:

- **Vercel KV (Recommended)**: `KV_REST_API_URL` and `KV_REST_API_TOKEN`
  - Automatically provided by Vercel KV Redis
  - **Takes precedence** when both naming conventions are present
- **Upstash Direct (Alternative)**: `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`
  - Used as fallback if KV_ variables not set
  - Useful for local development or non-Vercel deployments

**Important:** If you set environment variables using command line tools, ensure there are no trailing newlines or spaces. Use `printf` instead of `echo` to avoid this:
```bash
# Correct
vercel env add KV_REST_API_URL production < <(printf '%s' "https://...")

# Incorrect (may add newline)
echo "https://..." | vercel env add KV_REST_API_URL production
```

**Required for production:**
- `CRON_SECRET` - Secures the cron endpoint
- `AGILE_GUID` - Agile WebSales API identifier
- Upstash Redis credentials (choose one naming convention):
  - **Preferred:** `KV_REST_API_URL` and `KV_REST_API_TOKEN` (Vercel KV)
  - **Alternative:** `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (Upstash direct)

**Required for voicemail system:**
- `TWILIO_ACCOUNT_SID` - Twilio account identifier
- `TWILIO_AUTH_TOKEN` - Twilio authentication token (also validates webhook signatures)
- `RESEND_API_KEY` - Resend API key for email notifications
- `OCINEMA_EMAIL` or `STAFF_EMAIL` - Email address to receive voicemail notifications
- `FROM_EMAIL` - Sender email address (optional, defaults to onboarding@resend.dev)
- `STAFF_DASHBOARD_SECRET` - Secure token for dashboard authentication (required for security)
  - **Security Note:** Must be a strong, random string (minimum 32 characters recommended)
  - Used for both API access and dashboard authentication
  - Generate with: `openssl rand -base64 32`
- `BASE_URL` - Production URL (e.g., https://miami-theater-voice-agent.vercel.app) for TwiML callbacks

**Optional for voicemail system:**
- `DISCORD_WEBHOOK_URL` - Discord webhook URL for real-time voicemail notifications
  - Create in Discord: Server Settings → Integrations → Webhooks → New Webhook
  - Format: `https://discord.com/api/webhooks/{webhook_id}/{webhook_token}`
  - When configured, sends rich embeds for new voicemails and transcriptions

### Voice Agent Integration

The API is specifically designed for ElevenLabs voice agents:
- CORS headers enabled for cross-origin requests
- Data formatted with human-readable summaries for text-to-speech
- Time formatting optimized for voice pronunciation
- Structured responses with summary fields for natural conversation

### Voicemail Integration

The voicemail system uses Twilio's native voice recording capabilities. The endpoints are accessed directly by a Twilio phone number (configured in Twilio Console), not via ElevenLabs webhooks.

**Twilio Phone Number Configuration:**
- Configure in Twilio Console: Voice & Fax → Webhook URL
- URL: `https://miami-theater-voice-agent.vercel.app/api/twilio/voicemail`
- Method: POST

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
- Discord notifications (optional)
  - Real-time rich embeds with caller info and recording link
  - Second notification with full transcription text
  - Supports caller name display from Twilio lookup
- Dashboard access at `/api/voicemail/list`

### Cron Job Security

The ingestion endpoint uses bearer token authentication and should only be called by Vercel's cron system.

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
1. Caller dials Twilio phone number (configured in Twilio Console)
2. Twilio invokes `/api/twilio/voicemail` which returns TwiML with `<Record>` verb
3. Twilio records caller's message and generates transcription
4. Recording complete → POST to `/api/twilio/voicemail-callback`
5. Callback stores voicemail in Redis sorted set
6. Resend email sent to staff with recording link
7. Discord notification sent with caller info and recording link (if configured)
8. Transcription complete → POST to `/api/twilio/voicemail-transcription`
9. Voicemail record updated with transcription text
10. Second email and Discord notification sent with full transcription

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
- Access: `/api/voicemail/dashboard` - Password-protected web UI with auto-refresh
- API Access: `/api/voicemail/list` - Bearer token authentication for JSON/HTML
- Features: Listen to recordings, view transcriptions, download MP3s, real-time updates
- Data source: Redis sorted set `voicemails:index`
- Display: Beautiful gradient UI with cards, or JSON API for programmatic access
- Security: Requires `STAFF_DASHBOARD_SECRET` in Authorization header
- Rate Limiting: Automatic brute force protection via Redis-backed rate limiting

**Rate Limiting (Authentication):**
The staff authentication system includes automatic rate limiting to prevent brute force attacks:
- **Implementation**: Redis-backed tracking with sliding window approach
- **Configuration**:
  - 5 failed attempts allowed per IP
  - 15-minute time window
  - 15-minute block duration after max attempts
- **Response**: HTTP 429 (Too Many Requests) with `retryAfter` timestamp
- **Behavior**:
  - Gracefully degrades if Redis unavailable (fail-open for availability)
  - Tracks attempts by IP address (x-forwarded-for, x-real-ip, or socket)
  - Resets counter on successful authentication
  - Extends block duration when max attempts reached
- **Utility Functions**:
  - `api/utils/rate-limit-auth.js` - Core rate limiting logic
  - `checkRateLimit(redis, ip)` - Check if IP is rate limited
  - `recordFailedAttempt(redis, ip)` - Record failed auth attempt
  - `resetRateLimit(redis, ip)` - Reset on successful auth

### Discord Notification Integration

The application uses Discord webhooks for real-time staff notifications:

```javascript
import { sendDiscordNotification } from '../utils/discord-notify.js';

// Send notification for new voicemail
await sendDiscordNotification(voicemail, 'new');

// Send notification for transcription
await sendDiscordNotification(voicemail, 'transcription');
```

**Key Features:**
- Rich Discord embeds with formatted voicemail information
- Two notification types: 'new' (blue embed) and 'transcription' (green embed)
- Includes caller phone number, duration, timestamp, and recording link
- Displays caller name when available from Twilio lookup
- Truncates long transcriptions to Discord's 1024 character limit
- Graceful error handling - failures don't block voicemail system

**Notification Content:**

*New Voicemail Notification:*
- 📞 Alert message
- 📱 Caller phone number
- 👤 Caller name (if available from Twilio lookup)
- ⏱️ Recording duration (formatted as minutes/seconds)
- 🕒 Timestamp
- 🎧 Direct link to recording

*Transcription Notification:*
- 📝 Alert message
- Caller information
- 📝 Full transcription text
- 🎧 Link to listen to recording

**Implementation:**
- `api/utils/discord-notify.js` - Core Discord webhook utility
- Called from `api/twilio/voicemail-callback.js` (new voicemail)
- Called from `api/twilio/voicemail-transcription.js` (transcription ready)
- Uses native `fetch()` API for webhook HTTP POST
- Optional feature - system works without Discord configured

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
- Twilio webhook signature validation to prevent forged requests
- Body parser explicitly enabled for all Twilio endpoints (required for Vercel)

**Common Issues & Solutions:**
- See `TROUBLESHOOTING.md` for detailed debugging steps
- Environment variables must not contain newlines (use `printf` instead of `echo` when setting)
- All Twilio webhook endpoints require `export const config = { api: { bodyParser: true } }`
- BASE_URL must be set correctly for TwiML callback URLs to work
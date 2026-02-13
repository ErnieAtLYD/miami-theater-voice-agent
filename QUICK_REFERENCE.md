# Quick Reference Guide

## Architecture at a Glance

```
┌─────────────────────────────────────────────┐
│           MIAMI THEATER VOICE AGENT         │
├─────────────────────────────────────────────┤
│                                             │
│  SHOWTIMES SYSTEM                           │
│  ┌────────┐    ┌───────┐    ┌───────────┐   │
│  │  Cron  │───▶│ Redis │◀───│ Voice     │   │
│  │ (30m)  │    │ Cache │    │ Agent     │   │
│  └────────┘    └───────┘    │ API       │   │
│      ↑                      └───────────┘   │
│   Agile API                        ↑        │
│                              ElevenLabs     │
│                                             │
│  VOICEMAIL SYSTEM                           │
│  ┌────────┐    ┌───────┐    ┌──────────┐    │
│  │ Twilio │───▶│ Redis │◀───│Dashboard │    │
│  │ Phone  │    │Storage│    │(Staff)   │    │
│  └────────┘    └───────┘    └──────────┘    │
│      ↓                                      │
│   Resend (Email)                            │
└─────────────────────────────────────────────┘
```

## Key Files

### API Endpoints
- `api/showtimes.js` - Voice agent query endpoint
- `api/cron/ingest-showtimes.js` - Automated data ingestion
- `api/twilio/voicemail.js` - TwiML voicemail endpoint
- `api/twilio/voicemail-callback.js` - Recording completion handler
- `api/twilio/voicemail-transcription.js` - Transcription handler
- `api/voicemail/list.js` - Staff dashboard (JSON + HTML)
- `api/voicemail/delete.js` - Voicemail deletion endpoint

### Utilities
- `api/utils/redis-client.js` - Centralized Redis client
- `api/utils/timezone.js` - Eastern Time handling
- `api/utils/validate-twilio.js` - Webhook signature validation
- `api/utils/auth-staff.js` - Dashboard authentication
- `api/utils/rate-limit-auth.js` - Brute force protection

## Common Code Patterns

### 1. Redis Client
```javascript
import { createRedisClient } from './utils/redis-client.js';

const redis = createRedisClient();

// Cache with TTL
await redis.setex('key', 3600, JSON.stringify(data));

// Retrieve
const data = await redis.get('key');

// Sorted set (ordered by timestamp)
await redis.zadd('voicemails:index', { score: Date.now(), member: id });
await redis.zrange('voicemails:index', 0, -1, { rev: true }); // Newest first
```

### 2. CORS Headers
```javascript
res.setHeader('Access-Control-Allow-Origin', '*');
res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

if (req.method === 'OPTIONS') {
  return res.status(200).end();
}
```

### 3. Twilio Webhooks
```javascript
// Enable body parser (REQUIRED on Vercel)
export const config = {
  api: { bodyParser: true },
};

// Validate signature
import { validateTwilioRequest } from '../utils/validate-twilio.js';

const validation = validateTwilioRequest(req);
if (!validation.isValid) {
  return res.status(401).json({ error: 'Unauthorized' });
}
```

### 4. TwiML Response
```javascript
import twilio from 'twilio';
const { twiml } = twilio;

const voiceResponse = new twiml.VoiceResponse();
voiceResponse.say({ voice: 'alice' }, 'Hello');
voiceResponse.record({ maxLength: 180, transcribe: true });

res.setHeader('Content-Type', 'text/xml');
return res.status(200).send(voiceResponse.toString());
```

### 5. Eastern Time Handling
```javascript
import { getEasternTimeDate, formatDateYYYYMMDD } from './utils/timezone.js';

// Get current date in Eastern Time
const todayET = getEasternTimeDate();
const todayStr = formatDateYYYYMMDD(todayET); // "2024-12-24"
```

### 6. Development Fallbacks
```javascript
try {
  data = await redis.get('key');
} catch (error) {
  if (process.env.VERCEL_ENV !== 'production') {
    data = getMockData();
  } else {
    throw error;
  }
}
```

### 7. Authentication
```javascript
import { authenticateStaff } from '../utils/auth-staff.js';

const auth = authenticateStaff(req);
if (!auth.authenticated) {
  return res.status(401).json({ error: 'Unauthorized' });
}
```

### 8. Fire-and-Forget Async
```javascript
// Don't await - runs in background
(async () => {
  const data = await slowOperation();
  await updateRecord(data);
})();

// Return immediately
return res.status(200).json({ success: true });
```

## Redis Data Structures

### Showtimes Data
```javascript
{
  movies: [...],              // All movies with showtimes
  by_date: {                  // Fast date lookup
    "2024-12-24": [...]
  },
  weekend: {                  // Pre-filtered weekend
    friday: [...],
    saturday: [...],
    sunday: [...]
  },
  upcoming: [...],            // Next 7 days
  total_showtimes: 42
}
```

**Keys:**
- `showtimes:current` - Cached showtime data (2hr TTL)
- `showtimes:last_updated` - ISO timestamp of last update

### Voicemail Data
```javascript
{
  id: "RExxxxx",              // RecordingSid
  recordingUrl: "https://...",
  duration: 45,
  from: "+1234567890",
  transcription: "...",
  createdAt: "2024-12-24T...",
  listened: false,
  callerName: "John Doe",     // From Twilio Lookup (optional)
  callerType: "consumer"      // From Twilio Lookup (optional)
}
```

**Keys:**
- `voicemails:index` - Sorted set (score=timestamp, member=RecordingSid)
- `voicemail:{RecordingSid}` - Individual voicemail record

## API Query Parameters

### Showtimes API (`/api/showtimes`)

**Date Queries:**
- `?date=2024-12-24` - Specific date
- `?day_type=today` - Today's showtimes
- `?day_type=tomorrow` - Tomorrow's showtimes
- `?day_type=weekend` - This weekend (Fri-Sun)

**Movie Queries:**
- `?movie_title=Substance` - Search by title (partial match)

**Time Filters:**
- `?time_preference=afternoon` - 12pm-5pm
- `?time_preference=evening` - 5pm-9pm
- `?time_preference=night` - 9pm+

**Combinations:**
```
/api/showtimes?day_type=weekend&time_preference=evening
/api/showtimes?movie_title=Anora&day_type=today
```

## Environment Variables

### Production Checklist

**Showtimes System:**
```bash
CRON_SECRET=random_string_here
AGILE_GUID=your_theater_guid
KV_REST_API_URL=https://your-redis.upstash.io
KV_REST_API_TOKEN=your_redis_token
```

**Voicemail System:**
```bash
TWILIO_ACCOUNT_SID=ACxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
RESEND_API_KEY=re_xxxxx
STAFF_EMAIL=staff@theater.com
STAFF_DASHBOARD_SECRET=$(openssl rand -base64 32)
BASE_URL=https://your-app.vercel.app
```

**Optional:**
```bash
FROM_EMAIL=noreply@theater.com
OCINEMA_EMAIL=alternative_email@theater.com
```

### Set Environment Variables (Vercel)
```bash
# Use printf to avoid trailing newlines!
printf '%s' "your_value" | vercel env add VARIABLE_NAME production
```

## Vercel Configuration

### vercel.json
```json
{
  "crons": [
    {
      "path": "/api/cron/ingest-showtimes",
      "schedule": "*/30 * * * *"
    }
  ],
  "functions": {
    "api/twilio/*.js": {
      "memory": 1024,
      "maxDuration": 10
    }
  }
}
```

### Cron Schedule Examples
- `*/30 * * * *` - Every 30 minutes
- `0 * * * *` - Every hour
- `0 */2 * * *` - Every 2 hours
- `0 9 * * 1-5` - 9am weekdays only
- `0 0 * * 0` - Midnight every Sunday

## Testing Commands

```bash
# Run all tests
npm test

# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# With coverage report
npm run test:coverage

# Watch mode (auto-rerun on changes)
npm run test:watch
```

## Deployment

```bash
# Local development
vercel dev

# Deploy to preview
vercel

# Deploy to production
vercel --prod

# View logs
vercel logs

# View environment variables
vercel env ls
```

## Twilio Configuration

### Phone Number Setup
1. Twilio Console → Phone Numbers → Manage → Active numbers
2. Click your number
3. Under "Voice Configuration":
   - **A Call Comes In:** Webhook
   - **URL:** `https://your-app.vercel.app/api/twilio/voicemail`
   - **HTTP:** POST

### Testing Webhooks Locally
```bash
# Install ngrok
npm i -g ngrok

# Start local server
vercel dev

# Expose local server
ngrok http 3000

# Use ngrok URL in Twilio:
# https://abc123.ngrok.io/api/twilio/voicemail
```

## Debugging

### Check Redis Connection
```bash
# In any API route:
const redis = createRedisClient();
const test = await redis.get('test');
console.log('Redis connection:', test ? 'OK' : 'Failed');
```

### Check Twilio Signature
```javascript
console.log('Signature:', req.headers['x-twilio-signature']);
console.log('URL:', req.headers.host);
console.log('Body:', req.body);
```

### View Vercel Logs
```bash
# Real-time logs
vercel logs --follow

# Function-specific logs
vercel logs --follow api/showtimes
```

### Common Issues

**Problem:** `req.body` is empty on Twilio endpoints
**Solution:** Add `export const config = { api: { bodyParser: true } };`

**Problem:** 401 on voicemail callbacks
**Solution:** Check BASE_URL matches actual deployment URL

**Problem:** "Today" shows wrong day
**Solution:** Use `getEasternTimeDate()` not `new Date()`

**Problem:** Environment variable has weird whitespace
**Solution:** Use `printf '%s'` instead of `echo` when setting

## Voice Response Examples

### Successful Query
```json
{
  "success": true,
  "data": [
    {
      "movie_title": "The Substance",
      "date": "2024-12-24",
      "time": "7:30 PM",
      "theater": "O Cinema South Beach",
      "summary": "The Substance is showing on Tuesday, December 24th at 7:30 PM at O Cinema South Beach"
    }
  ],
  "conversational_summary": "I found 1 showtime for The Substance. The Substance is showing on Tuesday, December 24th at 7:30 PM at O Cinema South Beach",
  "query_info": {
    "movie_title": "Substance",
    "results_count": 1
  }
}
```

### No Results
```json
{
  "success": true,
  "data": [],
  "conversational_summary": "I couldn't find any showtimes for that movie. Would you like me to search for a different movie or show you what's currently playing?",
  "query_info": {
    "movie_title": "Nonexistent Movie",
    "results_count": 0
  }
}
```

## Rate Limiting

**Configuration:**
- **Max attempts:** 5 failed logins per IP
- **Time window:** 15 minutes
- **Block duration:** 15 minutes

**Test rate limiting:**
```bash
# Make 6 requests with wrong password
for i in {1..6}; do
  curl -H "Authorization: Bearer wrong" \
    https://your-app.vercel.app/api/voicemail/list
done

# 6th request returns 429 Too Many Requests
```

## Useful Redis Commands (via Upstash Console)

```bash
# View all voicemails (newest first)
ZRANGE voicemails:index 0 -1 REV

# Get specific voicemail
GET voicemail:RExxxxx

# Delete voicemail
ZREM voicemails:index RExxxxx
DEL voicemail:RExxxxx

# View current showtimes
GET showtimes:current

# Check last update time
GET showtimes:last_updated

# Manual cache clear
DEL showtimes:current
```

## ElevenLabs Integration

### Add as Custom Tool

**Name:** Get Theater Showtimes

**Description:**
```
Retrieves current movie showtimes for O Cinema Miami Beach.
Use this when users ask about movies, showtimes, or what's playing.
```

**Endpoint:**
```
https://your-app.vercel.app/api/showtimes
```

**Method:** GET

**Parameters:**
- `movie_title` (string, optional) - Search for specific movie
- `date` (string, optional) - Format: YYYY-MM-DD
- `day_type` (string, optional) - today, tomorrow, or weekend
- `time_preference` (string, optional) - afternoon, evening, or night

**Response Handling:**
```
Use the "conversational_summary" field for natural voice responses.
Reference individual items from "data" array for detailed questions.
```

---

## Quick Checklist for New Developers

**First Time Setup:**
- [ ] Clone repository
- [ ] Run `npm install`
- [ ] Copy environment variables from team
- [ ] Run `vercel dev` to start local server
- [ ] Visit http://localhost:3000/api/showtimes
- [ ] Read TUTORIAL.md for deep dive

**Before Pushing Changes:**
- [ ] Run `npm test` (all tests pass)
- [ ] Test locally with `vercel dev`
- [ ] Update CLAUDE.md if architecture changes
- [ ] Check CORS headers if adding new endpoints
- [ ] Add timezone handling for date queries

**For Twilio Endpoints:**
- [ ] Add `export const config = { api: { bodyParser: true } }`
- [ ] Import and call `validateTwilioRequest(req)`
- [ ] Return TwiML as `text/xml` content type
- [ ] Test with ngrok before deploying

---

*For detailed explanations, see TUTORIAL.md*
*For troubleshooting, see TROUBLESHOOTING.md*
*For project context, see CLAUDE.md*

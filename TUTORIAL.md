# Building a Voice-Enabled Theater Information System

## What You'll Learn

By the end of this tutorial, you'll understand how to:
- Build serverless APIs for voice assistants (ElevenLabs integration)
- Implement automated data ingestion with Vercel cron jobs
- Create a Twilio voicemail system with transcription
- Use Redis for efficient data caching and retrieval
- Design voice-optimized API responses
- Handle webhook security and validation

## Prerequisites

**Required Knowledge:**
- JavaScript/Node.js fundamentals (async/await, modules)
- Basic understanding of REST APIs
- Familiarity with serverless functions
- Understanding of webhooks

**Required Accounts/Tools:**
- Vercel account (for deployment)
- Upstash Redis database
- Twilio account (for voicemail)
- Resend account (for email notifications)
- ElevenLabs account (for voice agent)

**Time Estimate:** 60-90 minutes

## Final Result

You'll build a complete voice agent system that:
1. Fetches theater showtimes every 30 minutes
2. Serves optimized data to voice assistants
3. Accepts and transcribes voicemails
4. Sends email notifications to staff
5. Provides a web dashboard for managing voicemails

---

## Part 1: Understanding the Architecture

### System Overview

This application is built on three interconnected systems:

```
┌─────────────────────────────────────────────────────────────┐
│                      VOICE AGENT SYSTEM                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────┐ │
│  │  Showtime    │──────│    Redis     │──────│ Voice    │ │
│  │  Ingestion   │      │    Cache     │      │ Agent    │ │
│  │  (Cron)      │      │              │      │ API      │ │
│  └──────────────┘      └──────────────┘      └──────────┘ │
│         ↑                                          ↑        │
│         │                                          │        │
│    Agile API                                ElevenLabs     │
│                                                             │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────┐ │
│  │   Twilio     │──────│    Redis     │──────│  Staff   │ │
│  │  Voicemail   │      │   Storage    │      │Dashboard │ │
│  │              │      │              │      │          │ │
│  └──────────────┘      └──────────────┘      └──────────┘ │
│         ↑                     │                    ↑        │
│         │                     │                    │        │
│   Phone Calls           Email (Resend)        Web Access   │
└─────────────────────────────────────────────────────────────┘
```

### Key Design Principles

1. **Serverless-First**: All endpoints are Vercel serverless functions
2. **Voice-Optimized**: Data formatted for natural text-to-speech
3. **Cache-Heavy**: Redis caching reduces API calls and improves response time
4. **Webhook-Driven**: Twilio callbacks handle async operations
5. **Graceful Degradation**: Development fallbacks when services unavailable

---

## Part 2: The Showtimes System

### 2.1 Data Ingestion (The Cron Job)

**What It Does:**
Every 30 minutes, Vercel automatically triggers a serverless function that fetches theater data and caches it in Redis.

**File:** `api/cron/ingest-showtimes.js`

Let's break down the key parts:

```javascript
// 1. Security: Verify cron secret
if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
  return res.status(401).json({ error: 'Unauthorized' });
}
```

**Why?** Without this check, anyone could trigger expensive API calls to your external data provider.

```javascript
// 2. Fetch from external API
const agileUrl = `https://prod3.agileticketing.net/websales/feed.ashx?guid=${process.env.AGILE_GUID}&showslist=true&format=json&v=latest`;
const agileResponse = await fetch(agileUrl);
const rawData = await agileResponse.json();
```

**Pattern:** External API → Transform → Cache. This separates data fetching from data serving.

```javascript
// 3. Process and optimize the data structure
const processedData = processAgileShowtimeData(rawData);

// 4. Cache with TTL (2 hours)
await redis.setex('showtimes:current', 7200, JSON.stringify(processedData));
await redis.setex('showtimes:last_updated', 7200, getEasternTimeISO());
```

**Why 2 hours?** The cron runs every 30 minutes, so 2 hours provides a safety buffer if a cron job fails.

#### The Data Transformation

The `processAgileShowtimeData()` function creates multiple views of the same data:

```javascript
{
  movies: [...],              // All movies with showtimes
  by_date: {                  // Fast date-based lookup
    "2024-12-24": [...],
    "2024-12-25": [...]
  },
  weekend: {                  // Pre-filtered weekend shows
    friday: [...],
    saturday: [...],
    sunday: [...]
  },
  upcoming: [...],            // Next 7 days
  total_showtimes: 42
}
```

**Design Pattern:** Pre-compute common queries to make API responses instant.

### 2.2 The Query API

**What It Does:**
Serves showtime data to the ElevenLabs voice agent with voice-optimized formatting.

**File:** `api/showtimes.js`

#### CORS Configuration for Voice Agents

```javascript
res.setHeader('Access-Control-Allow-Origin', '*');
res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

if (req.method === 'OPTIONS') {
  return res.status(200).end();
}
```

**Why?** ElevenLabs voice agents make cross-origin requests. Without CORS headers, browsers block the requests.

#### Smart Query Routing

```javascript
// Handle different query types
if (day_type === 'weekend') {
  results = getWeekendShowtimes(showtimes);
} else if (day_type === 'today') {
  const today = formatDateYYYYMMDD(getEasternTimeDate());
  results = getShowtimesByDate(showtimes, today);
} else if (movie_title) {
  results = getShowtimesByMovie(showtimes, movie_title);
}
```

**Pattern:** Route to pre-computed data structures for O(1) lookups instead of filtering arrays.

#### Voice-Optimized Formatting

Here's where the magic happens for voice assistants:

```javascript
function formatForVoiceAgent(results) {
  return results.map(item => {
    const showtime = item.showtime || item.showtimes?.[0];

    return {
      movie_title: movie,
      date: showtime?.date,
      time: formatTimeForVoice(showtime?.time),
      theater: showtime?.theater,

      // Human-readable summary for voice synthesis
      summary: generateShowtimeSummary(movie, showtime)
    };
  });
}
```

Example transformation:

```javascript
// Before (data structure)
{
  title: "The Substance",
  showtimes: [{ date: "2024-12-24", time: "19:30" }]
}

// After (voice-optimized)
{
  movie_title: "The Substance",
  date: "2024-12-24",
  time: "7:30 PM",
  summary: "The Substance is showing on Tuesday, December 24th at 7:30 PM at O Cinema South Beach"
}
```

**Why?** Voice agents can speak the summary naturally, while structured data remains available for advanced queries.

#### The Conversational Summary

```javascript
function generateConversationalSummary(results, queryParams) {
  const count = results.length;

  if (count === 0) {
    return "I couldn't find any showtimes for that request. Would you like me to show you what's currently playing?";
  }

  let summary = `I found ${count} showtime${count > 1 ? 's' : ''}`;

  if (movie_title) {
    summary += ` for ${results[0]?.movie_title}`;
  }

  if (count <= 3) {
    summary += ` Here are your options: ${results.map(r => r.summary).join('. ')}`;
  }

  return summary;
}
```

**Voice UX Design:** The response guides the conversation flow and offers natural follow-up options.

### 2.3 Development Fallbacks

Notice this pattern throughout the code:

```javascript
try {
  cachedData = await redis.get('showtimes:current');
} catch (error) {
  if (process.env.VERCEL_ENV !== 'production') {
    console.log('Using mock data for development');
    cachedData = getDevelopmentMockData();
  } else {
    throw error;
  }
}
```

**Why?** You can develop locally without Redis credentials. Production remains strict.

---

## Part 3: The Voicemail System

The voicemail system is built on Twilio's webhook architecture. Understanding the flow is crucial:

### 3.1 The Call Flow

```
1. Customer calls → Twilio number
2. Twilio fetches → /api/twilio/voicemail
3. Returns TwiML → <Say> + <Record> instructions
4. Recording starts → Customer leaves message
5. Recording ends → Twilio POSTs to /api/twilio/voicemail-callback
6. Callback stores → Redis + sends email
7. Transcription ready → Twilio POSTs to /api/twilio/voicemail-transcription
8. Transcription stored → Redis + sends second email
```

### 3.2 TwiML Generation

**File:** `api/twilio/voicemail.js`

```javascript
import twilio from 'twilio';
const { twiml } = twilio;

const voiceResponse = new twiml.VoiceResponse();

// 1. Greeting
voiceResponse.say({
  voice: 'alice',
  language: 'en-US'
}, 'Please leave a detailed message after the beep. Press the star key when you are finished.');

// 2. Record with callbacks
voiceResponse.record({
  maxLength: 180,                    // 3 minutes max
  finishOnKey: '*',                  // Star to finish
  transcribe: true,                  // Enable transcription
  transcribeCallback: `${baseUrl}/api/twilio/voicemail-transcription`,
  action: `${baseUrl}/api/twilio/voicemail-callback`,
  recordingStatusCallback: `${baseUrl}/api/twilio/recording-status`
});

// 3. Return TwiML as XML
res.setHeader('Content-Type', 'text/xml');
return res.status(200).send(voiceResponse.toString());
```

**Important Configuration:**

```javascript
export const config = {
  api: {
    bodyParser: true,  // REQUIRED for Twilio webhooks on Vercel
  },
};
```

**Why?** Vercel disables body parsing by default for API routes. Twilio sends form-encoded data that won't parse without this.

### 3.3 Recording Callback

**File:** `api/twilio/voicemail-callback.js`

This endpoint receives the recording data:

```javascript
const {
  RecordingSid,      // Unique ID for the recording
  RecordingUrl,      // URL to download the audio
  RecordingDuration, // Length in seconds
  From,              // Caller's phone number
  To,                // Your Twilio number
} = req.body;
```

#### Security: Webhook Validation

```javascript
const validation = validateTwilioRequest(req);
if (!validation.isValid) {
  return res.status(validation.statusCode).json({ error: validation.error });
}
```

**Why?** Without validation, anyone could POST fake voicemails to your system.

**How it works** (`api/utils/validate-twilio.js`):

```javascript
import twilio from 'twilio';

export function validateTwilioRequest(req) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioSignature = req.headers['x-twilio-signature'];

  // Twilio signs each webhook with HMAC
  const isValid = twilio.validateRequest(
    authToken,
    twilioSignature,
    url,
    req.body
  );

  return { isValid };
}
```

#### Redis Storage Pattern

```javascript
// 1. Use sorted set for chronological ordering
const timestamp = Date.now();
await redis.zadd('voicemails:index', {
  score: timestamp,      // Timestamp as score
  member: RecordingSid   // Recording ID as member
});

// 2. Store full record with ID as key
await redis.set(`voicemail:${RecordingSid}`, JSON.stringify(voicemail));
```

**Why this structure?**
- `voicemails:index` gives us chronologically ordered list (newest first)
- Individual keys allow fast lookups: `redis.get('voicemail:RE123abc')`
- Easy to paginate: `redis.zrange('voicemails:index', 0, 9)` gets 10 newest

#### Async Caller Lookup

```javascript
// Perform caller lookup (async, cached, cost-optimized)
(async () => {
  try {
    const lookupData = await lookupCaller(From, redis, false);
    if (lookupData) {
      voicemail.callerName = lookupData.callerName;
      voicemail.callerType = lookupData.callerType;
      await redis.set(`voicemail:${RecordingSid}`, JSON.stringify(voicemail));
    }
  } catch (err) {
    console.log('Caller lookup failed (non-critical):', err.message);
  }
})();
```

**Pattern:** Fire-and-forget async operation. The voicemail saves immediately, caller info enriches it later.

**Why?** Twilio Lookup API costs $0.005 per lookup and can be slow. Don't block the response.

### 3.4 Email Notifications

```javascript
if (process.env.RESEND_API_KEY && process.env.STAFF_EMAIL) {
  try {
    await sendVoicemailEmail(voicemail, 'new');
  } catch (emailError) {
    console.error('Failed to send email notification:', emailError);
    // Don't fail the request if email fails
  }
}
```

**Pattern:** Non-critical operations should never crash critical flows.

---

## Part 4: The Staff Dashboard

### 4.1 Dual-Mode Endpoint

**File:** `api/voicemail/list.js`

This endpoint serves both:
1. JSON API (for programmatic access)
2. HTML Dashboard (for staff browsers)

```javascript
// Check Accept header
const acceptsHtml = req.headers.accept?.includes('text/html');

if (acceptsHtml) {
  // Return beautiful HTML dashboard
  return res.status(200).send(generateDashboardHTML(voicemails));
} else {
  // Return JSON API
  return res.status(200).json({
    success: true,
    voicemails: voicemails,
    count: voicemails.length
  });
}
```

**Why?** One endpoint, multiple interfaces. Staff can bookmark the URL, developers can integrate via API.

### 4.2 Authentication

```javascript
// Bearer token authentication
const authHeader = req.headers.authorization;
const expectedToken = `Bearer ${process.env.STAFF_DASHBOARD_SECRET}`;

if (authHeader !== expectedToken) {
  return res.status(401).json({ error: 'Unauthorized' });
}
```

**Security Note:** This uses a shared secret. For multi-user scenarios, implement JWT or session-based auth.

### 4.3 Rate Limiting

**File:** `api/utils/rate-limit-auth.js`

```javascript
export async function checkRateLimit(redis, ip) {
  const key = `rate-limit:auth:${ip}`;

  try {
    const attempts = await redis.get(key);
    if (!attempts) return { limited: false };

    const data = JSON.parse(attempts);

    if (data.count >= MAX_ATTEMPTS) {
      const now = Date.now();
      if (now < data.blockedUntil) {
        return {
          limited: true,
          retryAfter: new Date(data.blockedUntil).toISOString()
        };
      }
    }

    return { limited: false };
  } catch (error) {
    // Fail open if Redis unavailable
    return { limited: false };
  }
}
```

**Design Choice:** Fail open vs. fail closed
- **Fail open** = Allow access if rate limiting fails (better availability)
- **Fail closed** = Block access if rate limiting fails (better security)

This system chooses availability. Adjust based on your security requirements.

---

## Part 5: Redis Integration

### 5.1 Centralized Client

**File:** `api/utils/redis-client.js`

```javascript
import { Redis } from '@upstash/redis';

export function createRedisClient() {
  return new Redis({
    url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}
```

**Why centralize?**
1. Single source of configuration
2. Environment variable fallback logic in one place
3. Easy to add connection pooling, retry logic, etc.

### 5.2 Upstash vs Traditional Redis

**Why Upstash?**
- HTTP-based (works in serverless environments)
- No connection pooling needed
- Pay-per-request pricing (no idle connection costs)
- Automatic scaling

**Key Operations:**

```javascript
// Set with expiration (TTL)
await redis.setex('key', 3600, JSON.stringify(data));

// Get and parse JSON
const data = await redis.get('key');
const parsed = typeof data === 'string' ? JSON.parse(data) : data;

// Sorted sets for ordered data
await redis.zadd('set', { score: timestamp, member: id });
const members = await redis.zrange('set', 0, -1, { rev: true }); // Newest first
```

---

## Part 6: Timezone Handling

**File:** `api/utils/timezone.js`

Theater showtimes are always in **Eastern Time**, but your serverless functions run on UTC.

```javascript
export function getEasternTimeDate() {
  // Get current time in Eastern timezone
  const now = new Date();
  return new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
}

export function formatDateYYYYMMDD(date) {
  // Format: 2024-12-24
  return date.toISOString().split('T')[0];
}
```

**Critical for:**
- "Show me today's movies" (today in Miami, not UTC)
- "What's showing this weekend" (weekend in Miami)
- Filtering past showtimes

**Common Bug:**
```javascript
// WRONG - Uses UTC date
const today = new Date().toISOString().split('T')[0];

// RIGHT - Uses Eastern Time
const todayET = getEasternTimeDate();
const today = formatDateYYYYMMDD(todayET);
```

---

## Part 7: Hands-On Exercises

### Exercise 1: Add a New Query Type

**Challenge:** Add support for `time_of_day` parameter that filters to "morning" (before noon).

<details>
<summary>Solution</summary>

```javascript
// In api/showtimes.js

// 1. Extract parameter
const { time_of_day } = req.method === 'GET' ? req.query : req.body;

// 2. Apply filter
if (time_of_day === 'morning') {
  results = filterByTimeOfDay(results, 'morning');
}

// 3. Add filter function
function filterByTimeOfDay(results, timeOfDay) {
  return results.filter(item => {
    const time = item.showtime?.time || item.showtimes?.[0]?.time;
    if (!time) return true;

    const parsed = parseTime12Hour(time);
    if (!parsed) return true;

    const { hour } = parsed;

    if (timeOfDay === 'morning') {
      return hour < 12;
    }
    return true;
  });
}
```
</details>

**Test it:**
```bash
curl "http://localhost:3000/api/showtimes?time_of_day=morning"
```

### Exercise 2: Debug a Failing Webhook

**Scenario:** Voicemail callbacks are returning 401 Unauthorized.

**Troubleshooting Steps:**

1. Check Twilio signature validation
2. Verify BASE_URL is set correctly
3. Ensure TWILIO_AUTH_TOKEN matches your account
4. Check Vercel logs for detailed errors

<details>
<summary>Common Issue</summary>

**Problem:** BASE_URL doesn't match the actual request URL.

Twilio validates the signature against the **exact URL** it called. If BASE_URL is `https://example.vercel.app` but Twilio calls `https://example-abc123.vercel.app`, validation fails.

**Solution:**
```javascript
// Use dynamic URL detection
const baseUrl = req.headers.host ? `https://${req.headers.host}` : process.env.BASE_URL;
```
</details>

### Exercise 3: Implement Voicemail Deletion

**Challenge:** Add a DELETE endpoint to remove voicemails from Redis.

<details>
<summary>Solution</summary>

**File:** `api/voicemail/delete.js`

```javascript
import { createRedisClient } from '../utils/redis-client.js';
import { authenticateStaff } from '../utils/auth-staff.js';

export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Authenticate
  const auth = authenticateStaff(req);
  if (!auth.authenticated) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Get recording ID from query
  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ error: 'Missing recording ID' });
  }

  try {
    const redis = createRedisClient();

    // Remove from sorted set
    await redis.zrem('voicemails:index', id);

    // Remove full record
    await redis.del(`voicemail:${id}`);

    return res.status(200).json({
      success: true,
      deleted: id
    });
  } catch (error) {
    console.error('Delete error:', error);
    return res.status(500).json({ error: 'Failed to delete voicemail' });
  }
}
```

**Test it:**
```bash
curl -X DELETE \
  "http://localhost:3000/api/voicemail/delete?id=RExxxxxx" \
  -H "Authorization: Bearer YOUR_SECRET"
```
</details>

---

## Part 8: Common Pitfalls and Solutions

### Pitfall 1: Environment Variables with Newlines

**Problem:**
```bash
# WRONG - Adds newline
echo "https://my-redis.upstash.io" | vercel env add KV_REST_API_URL
```

**Solution:**
```bash
# RIGHT - No newline
printf '%s' "https://my-redis.upstash.io" | vercel env add KV_REST_API_URL
```

### Pitfall 2: Missing Body Parser

**Problem:** Twilio webhooks receive empty `req.body`

**Solution:** Add to every Twilio endpoint:
```javascript
export const config = {
  api: {
    bodyParser: true,
  },
};
```

### Pitfall 3: Timezone Confusion

**Problem:** "Today's showtimes" shows yesterday's movies

**Solution:** Always use Eastern Time for date comparisons:
```javascript
const todayET = getEasternTimeDate();
const todayStr = formatDateYYYYMMDD(todayET);
```

### Pitfall 4: Blocking Async Operations

**Problem:** Slow Twilio Lookup API delays webhook response

**Solution:** Fire-and-forget pattern:
```javascript
// Don't await
(async () => {
  const data = await slowOperation();
  await updateRecord(data);
})();

// Return immediately
return res.status(200).json({ success: true });
```

---

## Part 9: Testing

### Unit Tests

**File:** `tests/unit/timezone.test.js`

```javascript
import { describe, it, expect } from '@jest/globals';
import { formatDateYYYYMMDD, parseTime12Hour } from '../../api/utils/timezone.js';

describe('Timezone utilities', () => {
  it('formats dates correctly', () => {
    const date = new Date('2024-12-24T15:30:00Z');
    expect(formatDateYYYYMMDD(date)).toBe('2024-12-24');
  });

  it('parses 12-hour time', () => {
    expect(parseTime12Hour('7:30 PM')).toEqual({ hour: 19, minute: 30 });
    expect(parseTime12Hour('12:00 AM')).toEqual({ hour: 0, minute: 0 });
  });
});
```

### Integration Tests

**File:** `tests/integration/showtimes.test.js`

```javascript
import { describe, it, expect, beforeAll } from '@jest/globals';
import handler from '../../api/showtimes.js';

describe('Showtimes API', () => {
  it('returns showtimes for a specific date', async () => {
    const req = {
      method: 'GET',
      query: { date: '2024-12-24' }
    };

    const res = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      end: jest.fn()
    };

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.any(Array)
      })
    );
  });
});
```

**Run tests:**
```bash
npm test                  # All tests
npm run test:unit         # Unit tests only
npm run test:integration  # Integration tests only
npm run test:coverage     # With coverage report
```

---

## Part 10: Deployment

### Vercel Configuration

**File:** `vercel.json`

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

**Cron Schedule Format:** `minute hour day month weekday`
- `*/30 * * * *` = Every 30 minutes
- `0 */2 * * *` = Every 2 hours
- `0 9 * * 1-5` = 9am on weekdays

### Environment Variables Checklist

**Required for Showtimes:**
- [ ] `CRON_SECRET` - Random string for cron endpoint
- [ ] `AGILE_GUID` - Agile WebSales theater ID
- [ ] `KV_REST_API_URL` - Upstash Redis URL
- [ ] `KV_REST_API_TOKEN` - Upstash Redis token

**Required for Voicemail:**
- [ ] `TWILIO_ACCOUNT_SID` - Twilio account ID
- [ ] `TWILIO_AUTH_TOKEN` - Twilio auth token
- [ ] `RESEND_API_KEY` - Resend email API key
- [ ] `STAFF_EMAIL` - Staff notification email
- [ ] `STAFF_DASHBOARD_SECRET` - Dashboard password
- [ ] `BASE_URL` - Your production URL

**Set in Vercel:**
```bash
vercel env add CRON_SECRET production
# Paste your secret when prompted

vercel env add KV_REST_API_URL production
# Paste Redis URL when prompted
```

### Deploy

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy to production
vercel --prod

# Check deployment
vercel logs
```

### Configure Twilio

1. Go to Twilio Console → Phone Numbers
2. Select your number
3. Under "Voice & Fax", set:
   - **A Call Comes In:** Webhook
   - **URL:** `https://your-app.vercel.app/api/twilio/voicemail`
   - **HTTP:** POST

---

## Part 11: Extending the System

### Adding New Voice Agent Features

**Example:** Add "movies by rating" query

1. Add parameter handling:
```javascript
const { rating } = req.method === 'GET' ? req.query : req.body;
```

2. Create filter function:
```javascript
function getMoviesByRating(showtimes, rating) {
  return showtimes.movies.filter(m => m.rating === rating.toUpperCase());
}
```

3. Update conversational summary:
```javascript
if (rating) {
  summary += ` rated ${rating}`;
}
```

### Adding Voicemail Features

**Example:** Mark voicemail as "listened"

```javascript
// In api/voicemail/mark-listened.js
export default async function handler(req, res) {
  const { id } = req.body;
  const redis = createRedisClient();

  const voicemail = await redis.get(`voicemail:${id}`);
  const data = JSON.parse(voicemail);

  data.listened = true;
  data.listenedAt = new Date().toISOString();

  await redis.set(`voicemail:${id}`, JSON.stringify(data));

  return res.status(200).json({ success: true });
}
```

---

## Summary

You've learned how to build a complete voice-enabled system with:

✅ **Automated data ingestion** with Vercel cron jobs
✅ **Voice-optimized API responses** for natural conversation
✅ **Twilio voicemail system** with transcription
✅ **Redis caching** for performance
✅ **Webhook security** and validation
✅ **Staff dashboard** with authentication
✅ **Timezone handling** for accurate queries
✅ **Graceful error handling** and development fallbacks

## Next Steps

**Immediate Improvements:**
- Add tests for voicemail endpoints
- Implement voicemail pagination for large datasets
- Add monitoring/alerting for failed cron jobs
- Cache Twilio Lookup results longer (30 days)

**Advanced Features:**
- Multi-theater support (expand beyond O Cinema)
- User preferences (save favorite theaters)
- SMS notifications for new voicemails
- Analytics dashboard (popular movies, peak times)

## Additional Resources

**Documentation:**
- [Vercel Serverless Functions](https://vercel.com/docs/functions)
- [Upstash Redis](https://docs.upstash.com/redis)
- [Twilio Voice](https://www.twilio.com/docs/voice)
- [ElevenLabs Conversational AI](https://elevenlabs.io/docs)

**Related Patterns:**
- [Webhook Architecture Best Practices](https://vercel.com/guides/webhooks)
- [Redis Data Structures](https://redis.io/docs/data-types/)
- [Voice UX Design](https://www.voiceuxdesign.com/)

---

**Questions or Issues?**
- Check `TROUBLESHOOTING.md` for common problems
- Review `CLAUDE.md` for project-specific guidance
- Open an issue on GitHub for bugs

---

*Tutorial created by the tutorial-engineer skill*

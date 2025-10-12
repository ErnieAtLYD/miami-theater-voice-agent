# Miami Theater Voice Agent

A voice agent API for O Cinema Miami theater showtimes that fetches data from Agile Ticketing Solutions' API and serves it optimized for voice interaction.



## Features

- **Serverless Architecture**: Built on Vercel Functions for automatic scaling
- **Automated Data Ingestion**: Fetches theater data every 30 minutes via scheduled cron job
- **Voice-Optimized API**: Responses formatted for natural text-to-speech integration
- **Multiple Query Types**: Support for date, movie title, and time-based searches
- **Voicemail System**: AI-powered voicemail with Twilio recording and transcription
- **Email Notifications**: Automatic staff notifications via Resend with recording links and transcriptions
- **Staff Dashboard**: Beautiful web interface for managing voicemails
- **High-Performance Caching**: Upstash Redis for sub-second response times
- **Cross-Origin Ready**: CORS enabled for voice agent platform integration
- **Production Ready**: Environment-based configuration with secure authentication

## API Endpoints

### GET/POST `/api/showtimes`

Query theater showtimes with various filters.

**Query Parameters:**
- `date` - Specific date (YYYY-MM-DD format)
- `movie_title` - Movie name search (partial matching)
- `day_type` - 'weekend', 'today', 'tomorrow'
- `time_preference` - 'evening', 'afternoon', 'night'

**Example Requests:**
```bash
# Get today's showtimes
curl "https://your-domain.vercel.app/api/showtimes?day_type=today"

# Search for a specific movie
curl "https://your-domain.vercel.app/api/showtimes?movie_title=spider"

# Get weekend evening shows
curl "https://your-domain.vercel.app/api/showtimes?day_type=weekend&time_preference=evening"
```

**Response Format:**
```json
{
  "success": true,
  "data": [
    {
      "movie_title": "Spider-Man",
      "date": "2024-01-15",
      "time": "7:30 PM",
      "theater": "O Cinema South Beach",
      "rating": "PG-13",
      "runtime": 148,
      "summary": "Spider-Man is showing on Monday, January 15 at 7:30 PM in O Cinema South Beach"
    }
  ],
  "last_updated": "2024-01-15T10:00:00.000Z",
  "query_info": {
    "results_count": 1
  }
}
```

### POST `/api/cron/ingest-showtimes`

Automated endpoint for data ingestion (secured with bearer token).

### Voicemail System Endpoints

#### POST `/api/twilio/voicemail`

Twilio webhook endpoint that returns TwiML for voicemail recording. Called by ElevenLabs Leave-Voicemail tool.

**Features:**
- Records up to 3 minutes of audio
- Automatic transcription via Twilio
- Caller can press `*` to finish recording
- Returns TwiML response for Twilio

#### POST `/api/twilio/voicemail-callback`

Handles completed voicemail recordings from Twilio.

**Actions:**
- Stores voicemail metadata in Redis
- Sends email notification to staff
- Returns TwiML confirmation message

#### POST `/api/twilio/voicemail-transcription`

Processes transcription results from Twilio.

**Actions:**
- Updates voicemail record with transcription text
- Sends follow-up email with transcription

#### GET `/api/voicemail/dashboard`

Password-protected web dashboard for staff to view and manage voicemails.

**Features:**
- Beautiful gradient UI with voicemail cards
- Auto-refresh every 30 seconds
- Session-based authentication
- Listen to recordings, view transcriptions, download MP3s
- Responsive design for mobile/desktop

**Access:**
```bash
# Open in browser and enter password when prompted
open https://your-domain.vercel.app/api/voicemail/dashboard
```

#### GET `/api/voicemail/list`

API/HTML endpoint for voicemail data (requires bearer token authentication).

**Authentication:**
```
Authorization: Bearer YOUR_STAFF_DASHBOARD_SECRET
```

**Query Parameters:**
- `limit` - Number of voicemails to return (default: 50)
- `offset` - Pagination offset (default: 0)
- `unlistened_only` - Filter to unlistened messages (true/false)

**Response Format:**
- `Accept: text/html` - Returns styled HTML dashboard
- `Accept: application/json` - Returns JSON array of voicemail objects

**Example:**
```bash
# Get JSON data (requires authentication)
curl -H "Authorization: Bearer YOUR_SECRET" \
  "https://your-domain.vercel.app/api/voicemail/list"

# Get HTML dashboard (requires authentication)
curl -H "Authorization: Bearer YOUR_SECRET" \
  -H "Accept: text/html" \
  "https://your-domain.vercel.app/api/voicemail/list"

# Filter unlistened only
curl -H "Authorization: Bearer YOUR_SECRET" \
  "https://your-domain.vercel.app/api/voicemail/list?unlistened_only=true"
```

## ElevenLabs Voice Agent Integration

This API is optimized for ElevenLabs Conversational AI, enabling natural voice queries about Miami theater showtimes.

### Quick Setup

1. **Install Dependencies**
   ```bash
   # Python
   pip install elevenlabs>=1.0.0

   # Or Node.js
   npm install elevenlabs dotenv
   ```

2. **Configure Environment**
   ```bash
   # Add to your .env file
   ELEVENLABS_API_KEY=sk-your-elevenlabs-api-key
   VERCEL_APP_URL=https://your-app.vercel.app
   ```

3. **Run Setup Script**
   ```bash
   cd elevenlabs
   python setup_agent.py  # or: node setup_agent.js
   ```

### Voice Interactions

**Showtime Queries:**
Users can ask natural questions like:
- *"What movies are playing tonight?"* → Today's evening showtimes
- *"When is The Substance showing?"* → All showtimes for that movie
- *"Any afternoon shows tomorrow?"* → Tomorrow's 12-5 PM showtimes
- *"What's playing this weekend?"* → Friday-Sunday showtimes

**Voicemail System:**
Callers can also:
- *"I'd like to speak to someone"* → Agent transfers to voicemail
- *"Can I leave a message?"* → Agent initiates voicemail recording
- *"I have a question about tickets"* → Agent offers to take a message

The API returns voice-optimized responses with conversational summaries for natural text-to-speech.

### Troubleshooting

- **Tool creation failed**: Verify `ELEVENLABS_API_KEY` is correct
- **Agent can't reach API**: Ensure `VERCEL_APP_URL` points to deployed app
- **Test directly**: `curl "your-app.vercel.app/api/showtimes?day_type=today"`

## Setup

### Prerequisites

- Node.js 18+ (with npm)
- [Vercel account](https://vercel.com) for deployment
- [Upstash Redis](https://upstash.com) serverless database instance
- Agile WebSales API access credentials

### Environment Variables

Create a `.env.local` file for local development:

```env
# Agile WebSales API
AGILE_GUID=your-agile-guid-here

# Redis Configuration (choose ONE option)

# Option 1: Direct Upstash Redis
UPSTASH_REDIS_REST_URL=https://your-region.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-redis-rest-token

# Option 2: Vercel KV (powered by Upstash)
# KV_REST_API_URL=https://your-region.kv.vercel-storage.com
# KV_REST_API_TOKEN=your-vercel-kv-token

# Cron Job Security
CRON_SECRET=your-secure-random-string

# Voicemail System (optional - required for voicemail functionality)
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
RESEND_API_KEY=your-resend-api-key
OCINEMA_EMAIL=info@o-cinema.org  # Primary email (fallback: STAFF_EMAIL)
FROM_EMAIL=O Cinema Voicemail <noreply@ocinema.org>

# Staff Dashboard Authentication (required for voicemail dashboard access)
STAFF_DASHBOARD_SECRET=your-secure-random-string-at-least-32-chars

# Base URL for TwiML callbacks (required for production)
BASE_URL=https://miami-theater-voice-agent.vercel.app
```

**Redis Setup Options (choose one):**
- **Direct Upstash**: Set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`
- **Vercel KV**: Set `KV_REST_API_URL` and `KV_REST_API_TOKEN` (automatically provisioned in Vercel dashboard)
- The application automatically detects which credentials are available

### Local Development

```bash
# Clone the repository
git clone <repository-url>
cd miami-theater-voice-agent

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your credentials

# Start Vercel development server
vercel dev

# Test the API endpoints
curl "http://localhost:3000/api/showtimes?day_type=today"
curl "http://localhost:3000/api/showtimes?movie_title=spider"
```

### Deployment

```bash
# Deploy to Vercel (first time)
vercel

# Set required environment variables
vercel env add AGILE_GUID
vercel env add CRON_SECRET

# Add Redis credentials (choose one option)
# For direct Upstash:
vercel env add UPSTASH_REDIS_REST_URL
vercel env add UPSTASH_REDIS_REST_TOKEN

# For Vercel KV (alternative - provision via Vercel dashboard instead)

# Add voicemail system credentials (if using voicemail feature)
# IMPORTANT: Use printf (not echo) to avoid newline characters
printf "your-account-sid" | vercel env add TWILIO_ACCOUNT_SID
printf "your-auth-token" | vercel env add TWILIO_AUTH_TOKEN
printf "your-resend-key" | vercel env add RESEND_API_KEY
printf "info@o-cinema.org" | vercel env add OCINEMA_EMAIL
printf "O Cinema <noreply@ocinema.org>" | vercel env add FROM_EMAIL
printf "your-secure-token" | vercel env add STAFF_DASHBOARD_SECRET  # REQUIRED for security
printf "https://your-app.vercel.app" | vercel env add BASE_URL  # REQUIRED for callbacks

# Deploy updates
vercel --prod
```

**Automatic Features on Vercel:**
- Serverless functions auto-deploy from `/api` directory
- Cron jobs automatically scheduled via `vercel.json`
- Environment variables securely managed in dashboard
- Auto-scaling based on traffic demand

### Voicemail System Setup

**1. Configure Twilio:**
- Sign up for [Twilio](https://www.twilio.com) account
- Copy Account SID and Auth Token to environment variables
- Note: You don't need a Twilio phone number for this setup (ElevenLabs handles the call)

**2. Configure Email (Resend):**
- Sign up for [Resend](https://resend.com) account (100 emails/day free)
- Create an API key from the dashboard
- Verify your sender email address or domain
- Add credentials to environment variables
- Note: Use format `Name <email@domain.com>` for FROM_EMAIL

**3. Configure ElevenLabs Agent:**
- Upload `elevenlabs/voicemail-tool-config.json` as a new webhook tool
- Update the URL to point to your deployed Vercel app
- Add the tool to your conversational AI agent
- The agent will now offer voicemail when appropriate

**4. Configure Security (Required):**

Before deploying to production, you **must** configure authentication to secure the voicemail system:

**Generate Staff Dashboard Secret:**
```bash
# Generate a secure random string (32+ characters)
openssl rand -base64 32
```

**Add to Vercel Environment Variables:**
```bash
# Via Vercel CLI
vercel env add STAFF_DASHBOARD_SECRET

# Or add via Vercel Dashboard:
# Settings → Environment Variables → Add New
# Name: STAFF_DASHBOARD_SECRET
# Value: [paste generated token]
```

**Important Security Notes:**
- `STAFF_DASHBOARD_SECRET` is **required** for dashboard access
- `TWILIO_AUTH_TOKEN` validates webhook authenticity (prevents forged requests)
- All Twilio webhooks are protected with signature validation
- Staff dashboard requires bearer token authentication

**Test Security Implementation:**
```bash
# Dashboard should reject requests without auth token (returns 401)
curl https://your-app.vercel.app/api/voicemail/list

# Access with valid token (returns voicemail list)
curl -H "Authorization: Bearer YOUR_STAFF_DASHBOARD_SECRET" \
  https://your-app.vercel.app/api/voicemail/list
```

**5. Access Staff Dashboard:**

**Web Dashboard (Recommended for Staff):**
- Navigate to `https://your-app.vercel.app/api/voicemail/dashboard`
- Enter your `STAFF_DASHBOARD_SECRET` password when prompted
- Beautiful UI with auto-refresh, listen to recordings, view transcriptions
- Session persists until logout

**API Access (For Developers):**
```bash
# JSON API with bearer token
curl -H "Authorization: Bearer YOUR_STAFF_DASHBOARD_SECRET" \
  https://your-app.vercel.app/api/voicemail/list
```

**Troubleshooting:**
If you encounter issues, see `TROUBLESHOOTING.md` for detailed debugging steps including:
- Twilio debugger usage
- Environment variable validation
- Common error codes and solutions
- Testing workflows

## Architecture

### Serverless Infrastructure

Built on **Vercel's serverless platform** with automatic scaling:

- **API Routes**: Deploy as individual Vercel Functions in `/api` directory
- **Scheduled Tasks**: Cron jobs defined in `vercel.json` configuration
- **Edge Network**: Global CDN distribution for low latency
- **Auto-scaling**: Functions scale up/down based on demand

### Data Flow

**Showtimes System:**
1. **Scheduled Ingestion**: Vercel Cron triggers `/api/cron/ingest-showtimes` every 30 minutes
2. **Data Fetching**: Serverless function pulls fresh data from Agile WebSales API
3. **Data Processing**: Raw theater data transformed into voice-optimized structures
4. **Redis Caching**: Processed data stored in Upstash Redis with 2-hour TTL
5. **API Serving**: `/api/showtimes` function serves cached data to voice agents

**Voicemail System:**
1. **Call Initiation**: Caller asks ElevenLabs agent to leave a message
2. **Tool Invocation**: Agent calls Leave-Voicemail webhook tool
3. **TwiML Generation**: `/api/twilio/voicemail` returns recording instructions
4. **Recording**: Twilio records caller's message (up to 3 minutes)
5. **Transcription**: Twilio generates automatic transcription
6. **Storage**: Voicemail stored in Redis with timestamp indexing
7. **Notification**: Staff receives email via Resend with recording link
8. **Dashboard Access**: Staff can review voicemails at `/api/voicemail/list`

### Data Structure & Caching

**Upstash Redis Integration:**
```javascript
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
});
```

**Optimized data structures for fast queries:**

*Showtimes:*
- `showtimes:current` - Complete processed dataset with 2-hour TTL
- `movies` - Array of all available movies with showtimes
- `by_date` - Hash map for date-based lookups
- `weekend` - Pre-filtered Friday/Saturday/Sunday showtimes
- `upcoming` - Next 7 days of showtimes
- `showtimes:last_updated` - Timestamp for cache freshness tracking

*Voicemails:*
- `voicemails:index` - Sorted set of voicemail IDs by timestamp
- `voicemail:{RecordingSid}` - Individual voicemail records with:
  - Recording URL and duration
  - Caller phone number
  - Transcription text
  - Timestamps and status

### Voice Agent Integration

**Optimized for ElevenLabs and voice AI platforms:**

```javascript
// Example Vercel Function for voice optimization
export default async function handler(req, res) {
  // CORS headers for voice agent integration
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Voice-optimized response format
  return res.json({
    summary: "Spider-Man is showing on Monday, January 15th at 7:30 PM",
    // ... additional structured data
  });
}
```

**Voice-Specific Features:**
- Human-readable response summaries for natural TTS
- Date/time formatting optimized for voice pronunciation
- Structured data with conversational context
- Cross-origin request support for web-based voice agents

## Theater Information

Currently configured for **Miami theater locations**:
- Primary: O Cinema South Beach (1130 Washington Ave, Miami Beach, FL)
- Data Source: Agile WebSales ticketing system
- Coverage: Real-time showtimes and movie information
- Update Frequency: Every 30 minutes via automated ingestion

## Security

**Production Security Features:**
- **Cron Protection**: Bearer token authentication for `/api/cron/*` endpoints
- **Environment Isolation**: Sensitive credentials stored in Vercel environment variables
- **CORS Configuration**: Cross-origin controls for voice agent integration
- **Input Validation**: Query parameter sanitization and validation
- **Serverless Isolation**: Each function runs in isolated containers
- **HTTPS Only**: All API endpoints served over encrypted connections

## Monitoring & Observability

**Built-in Monitoring:**
- **Vercel Analytics**: Function execution metrics and performance
- **Console Logging**: Structured logging for cron job execution
- **Error Tracking**: HTTP status codes and error handling
- **Cache Monitoring**: Redis TTL and last updated timestamps
- **Uptime Tracking**: Automatic function health monitoring

**Development Debugging:**
```bash
# View function logs
vercel logs

# Monitor cron job execution
vercel logs --filter="/api/cron"
```


## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test locally with `vercel dev`
5. Test ElevenLabs integration if applicable
6. Submit a pull request

## License

ISC
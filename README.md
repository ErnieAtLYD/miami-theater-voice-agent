# Miami Theater Voice Agent

A voice agent API for O Cinema Miami theater showtimes that fetches data from Agile Ticketing Solutions' API and serves it optimized for voice interaction.



## Features

- **Serverless Architecture**: Built on Vercel Functions for automatic scaling
- **Automated Data Ingestion**: Fetches theater data every 30 minutes via scheduled cron job
- **Voice-Optimized API**: Responses formatted for natural text-to-speech integration
- **Multiple Query Types**: Support for date, movie title, and time-based searches
- **High-Performance Caching**: Upstash Redis for sub-second response times
- **Cross-Origin Ready**: CORS enabled for voice agent platform integration
- **Customer Message Forwarding**: Email integration for voice agent users to leave messages
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

### POST `/api/send-message`

Enables voice agent users to leave messages for O Cinema staff, delivered via email.

**ElevenLabs Integration:** This endpoint should be configured as a second webhook tool named `Send-Message-To-Cinema` in your ElevenLabs agent setup.

**Request Body:**
```json
{
  "caller_name": "John Doe",
  "caller_phone": "(305) 555-1234",
  "message": "I'd like to inquire about group bookings",
  "context": "Asking about showtimes"
}
```

**Parameters:**
- `message` (required) - The message to send
- `caller_name` (optional) - Caller's name
- `caller_phone` (optional) - Caller's phone number
- `context` (optional) - What they were doing before leaving message

**Example Request:**
```bash
curl -X POST "https://your-domain.vercel.app/api/send-message" \
  -H "Content-Type: application/json" \
  -d '{
    "caller_name": "Jane Smith",
    "caller_phone": "(305) 555-5678",
    "message": "I would like to book a private screening",
    "context": "Inquiring about The Substance showtimes"
  }'
```

**Response Format:**
```json
{
  "success": true,
  "email_id": "abc123",
  "conversational_response": "Thank you, Jane. Your message has been sent to O Cinema's team. Someone will get back to you soon. Is there anything else I can help you with?",
  "message_info": {
    "sent_at": "Monday, January 15, 2024, 3:30 PM",
    "caller_name": "Jane Smith",
    "has_phone": true
  }
}
```

### POST `/api/cron/ingest-showtimes`

Automated endpoint for data ingestion (secured with bearer token).

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

   **Note:** The current setup scripts only create the `Miami-Theater-Showtimes` tool. You need to manually add a second webhook tool for `Send-Message-To-Cinema` (POST to `/api/send-message`) in the ElevenLabs dashboard and update the agent's system prompt to mention message forwarding capabilities.

### Voice Interactions

Users can ask natural questions like:
- *"What movies are playing tonight?"* → Today's evening showtimes
- *"When is The Substance showing?"* → All showtimes for that movie
- *"Any afternoon shows tomorrow?"* → Tomorrow's 12-5 PM showtimes
- *"What's playing this weekend?"* → Friday-Sunday showtimes
- *"I'd like to leave a message for the theater"* → Forwards message to O Cinema via email *(requires manual tool setup - see note above)*

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
- Agile Ticketing Solutions WebSales API access credentials
- [Resend account](https://resend.com) for email delivery (required for message forwarding)

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

# Email Service (Resend)
RESEND_API_KEY=re_your-resend-api-key
OCINEMA_EMAIL=contact@ocinema.org
RESEND_FROM_EMAIL=O Cinema Voice Agent <onboarding@resend.dev>
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

# Add email service credentials
vercel env add RESEND_API_KEY
vercel env add OCINEMA_EMAIL
vercel env add RESEND_FROM_EMAIL  # Optional - defaults to onboarding@resend.dev

# Deploy updates
vercel --prod
```

**Automatic Features on Vercel:**
- Serverless functions auto-deploy from `/api` directory
- Cron jobs automatically scheduled via `vercel.json`
- Environment variables securely managed in dashboard
- Auto-scaling based on traffic demand

## Architecture

### Serverless Infrastructure

Built on **Vercel's serverless platform** with automatic scaling:

- **API Routes**: Deploy as individual Vercel Functions in `/api` directory
- **Scheduled Tasks**: Cron jobs defined in `vercel.json` configuration
- **Edge Network**: Global CDN distribution for low latency
- **Auto-scaling**: Functions scale up/down based on demand

### Data Flow

1. **Scheduled Ingestion**: Vercel Cron triggers `/api/cron/ingest-showtimes` every 30 minutes
2. **Data Fetching**: Serverless function pulls fresh data from Agile WebSales API
3. **Data Processing**: Raw theater data transformed into voice-optimized structures
4. **Redis Caching**: Processed data stored in Upstash Redis with 2-hour TTL
5. **API Serving**: `/api/showtimes` function serves cached data to voice agents

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

- `showtimes:current` - Complete processed dataset with 2-hour TTL
- `movies` - Array of all available movies with showtimes
- `by_date` - Hash map for date-based lookups
- `weekend` - Pre-filtered Friday/Saturday/Sunday showtimes
- `upcoming` - Next 7 days of showtimes
- `showtimes:last_updated` - Timestamp for cache freshness tracking

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
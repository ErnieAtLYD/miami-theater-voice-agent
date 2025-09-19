# Miami Theater Voice Agent

A Vercel-hosted voice agent API for Miami theater showtimes, designed to integrate with ElevenLabs' voice agent system. The application fetches theater data from Agile WebSales and serves it through a REST API optimized for voice interaction using serverless functions.

## Features

- **Serverless Architecture**: Built on Vercel Functions for automatic scaling
- **Automated Data Ingestion**: Fetches theater data every 30 minutes via scheduled cron job
- **Voice-Optimized API**: Responses formatted for natural text-to-speech integration
- **Multiple Query Types**: Support for date, movie title, and time-based searches
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

# Upstash Redis Configuration
UPSTASH_REDIS_REST_URL=https://your-region.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-redis-rest-token

# Alternative Redis environment variables (Vercel KV)
KV_REST_API_URL=https://your-region.upstash.io
KV_REST_API_TOKEN=your-redis-rest-token

# Cron Job Security
CRON_SECRET=your-secure-random-string
```

**Redis Setup Options:**
- Use `UPSTASH_REDIS_REST_*` for direct Upstash integration
- Use `KV_REST_API_*` when using Vercel KV (powered by Upstash)
- The application automatically detects and uses available credentials

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
vercel env add UPSTASH_REDIS_REST_URL
vercel env add UPSTASH_REDIS_REST_TOKEN
vercel env add CRON_SECRET

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

## ElevenLabs Voice Agent Integration

### Overview

This project includes complete integration with ElevenLabs Conversational AI, allowing users to ask natural voice questions about Miami theater showtimes and receive spoken responses.

### Quick Setup

1. **Prerequisites**
   ```bash
   # Install ElevenLabs Python SDK
   pip install elevenlabs>=1.0.0

   # Or use Node.js version
   npm install elevenlabs dotenv
   ```

2. **Environment Configuration**
   ```bash
   # Add to your .env file
   ELEVENLABS_API_KEY=sk-your-elevenlabs-api-key
   VERCEL_APP_URL=https://your-app.vercel.app
   ```

3. **Run Setup Script**
   ```bash
   # Python version
   cd elevenlabs
   python setup_agent.py

   # Node.js version
   cd elevenlabs
   node setup_agent.js
   ```

### Voice Interactions Examples

Users can now ask natural questions like:

- **"What movies are playing tonight?"**
  - → Searches today's evening showtimes
- **"When is The Substance showing?"**
  - → Finds all showtimes for that specific movie
- **"Any afternoon shows tomorrow?"**
  - → Filters tomorrow's afternoon (12-5 PM) showtimes
- **"What's playing this weekend?"**
  - → Shows Friday-Sunday showtimes

### Agent Configuration

The ElevenLabs agent is configured with:

- **Webhook Tool**: Connects directly to your `/api/showtimes` endpoint
- **Smart Parameters**: Automatically maps voice queries to API parameters
- **Voice-Optimized Responses**: Natural language summaries for TTS
- **Conversational Flow**: Handles follow-up questions and clarifications

### Response Format

The API now returns voice-optimized responses:

```json
{
  "success": true,
  "data": [...],
  "conversational_summary": "I found 3 showtimes for today. The Substance is showing today at 2 PM at O Cinema South Beach. Anora is showing today at 5 PM at O Cinema South Beach...",
  "query_info": {
    "results_count": 3
  }
}
```

### Advanced Configuration

#### Custom Voice Settings
```javascript
// Configure in ElevenLabs dashboard
{
  "voice_id": "your-preferred-voice-id",
  "voice_settings": {
    "stability": 0.75,
    "similarity_boost": 0.85,
    "style": 0.2
  }
}
```

#### Authentication (Optional)
```javascript
// Add to webhook tool configuration
"request_headers": {
  "Authorization": "Bearer YOUR_API_TOKEN",
  "Content-Type": "application/json"
}
```

### File Structure

```
elevenlabs/
├── webhook-tool-config.json    # Tool configuration
├── setup_agent.py              # Python setup script
├── setup_agent.js              # Node.js setup script
├── requirements.txt            # Python dependencies
├── package.json               # Node.js dependencies
└── agent_config.json          # Generated config (after setup)
```

### Troubleshooting

**Common Issues:**

1. **"Tool creation failed"**
   - Verify `ELEVENLABS_API_KEY` is set correctly
   - Check your ElevenLabs subscription limits

2. **"Agent can't reach API"**
   - Ensure `VERCEL_APP_URL` points to your deployed app
   - Verify CORS headers are enabled (they are by default)

3. **"Voice responses sound unnatural"**
   - Check the `conversational_summary` field in API responses
   - Adjust voice settings in ElevenLabs dashboard

**Getting Help:**
- View agent logs in ElevenLabs dashboard
- Test API endpoints directly: `curl "your-app.vercel.app/api/showtimes?day_type=today"`
- Check Vercel function logs: `vercel logs`

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test locally with `vercel dev`
5. Test ElevenLabs integration if applicable
6. Submit a pull request

## License

ISC
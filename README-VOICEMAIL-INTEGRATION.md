# ElevenLabs-Twilio Voicemail Integration

## Overview

This integration allows callers interacting with your ElevenLabs voice agent to leave voicemail messages that are recorded via Twilio, transcribed, stored in Redis, and emailed to staff.

## ⚠️ Important: Correct Architecture

**The original webhook-based implementation does not work.** You must use the call transfer approach instead.

### Why Webhook Approach Fails

```mermaid
graph LR
    A[ElevenLabs Agent] -->|POST JSON| B[Webhook Tool]
    B -->|HTTP Request| C[/api/twilio/voicemail]
    C -->|Returns TwiML XML| B
    B -->|❌ Cannot process TwiML| A
    style B fill:#f99
    style C fill:#f99
```

**Problem:** ElevenLabs webhook tools expect JSON responses. The endpoint returns TwiML (XML) which ElevenLabs cannot process. Webhook tools cannot transfer calls.

### Correct Architecture (Call Transfer)

```mermaid
graph TD
    A[ElevenLabs Agent] -->|transfer_to_number| B[Twilio Phone Number]
    B -->|Request TwiML| C[/api/twilio/voicemail]
    C -->|Return TwiML| B
    B -->|Record Audio| D[Twilio Recording]
    B -->|Callback| E[/api/twilio/voicemail-callback]
    E -->|Store| F[(Redis)]
    E -->|Send| G[Email Notification]
    B -->|Transcribe| H[Twilio Transcription]
    H -->|Callback| I[/api/twilio/voicemail-transcription]
    I -->|Update| F
    I -->|Send| G
    style A fill:#9f9
    style B fill:#9f9
    style C fill:#9f9
```

**Solution:** Use ElevenLabs' `transfer_to_number` system tool to transfer calls to a Twilio number that requests the TwiML endpoint.

---

## Setup Instructions

### Prerequisites

- ✅ ElevenLabs Conversational AI agent
- ✅ Twilio account with phone number
- ✅ Vercel deployment (or other hosting)
- ✅ Upstash Redis database
- ✅ Resend account for emails

### Step 1: Environment Variables

Set these in Vercel (or your `.env` file):

```bash
# Twilio credentials
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here

# Redis (Upstash)
KV_REST_API_URL=https://your-redis.upstash.io
KV_REST_API_TOKEN=your_token_here

# Email notifications (Resend)
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxx
STAFF_EMAIL=staff@yourtheater.com
FROM_EMAIL=voicemail@yourtheater.com  # optional

# Base URL (optional, auto-detected)
BASE_URL=https://your-app.vercel.app
```

### Step 2: Get Twilio Phone Number

#### Option A: Via Twilio Console
1. Go to https://console.twilio.com/
2. Phone Numbers → Buy a Number
3. Purchase a number (e.g., `+15551234567`)

#### Option B: Via Twilio CLI
```bash
twilio phone-numbers:buy:mobile --country-code US
```

### Step 3: Configure Twilio Number

1. Go to Twilio Console → Phone Numbers → Manage → Active Numbers
2. Click on your purchased number
3. Under **Voice & Fax** section:
   - **A CALL COMES IN:** Webhook
   - **URL:** `https://your-app.vercel.app/api/twilio/voicemail`
   - **HTTP Method:** POST
4. Under **Call Status Changes**:
   - **URL:** `https://your-app.vercel.app/api/twilio/call-status`
   - **HTTP Method:** POST
5. Click **Save**

### Step 4: Configure ElevenLabs Agent

#### Enable System Tool

1. Go to ElevenLabs Dashboard
2. Open your Conversational AI agent
3. Go to **Tools** section
4. Enable **System Tools** → `transfer_to_number`

#### Update Agent Prompt

Add this to your agent's system prompt:

```
When the caller asks to:
- Leave a message
- Speak to a staff member
- Talk to a human
- Leave a voicemail

Follow this process:
1. Say: "I'll transfer you to our voicemail system. Please hold while I connect you."
2. Use the transfer_to_number tool with phone_number: "+15551234567"
   (Replace with your actual Twilio voicemail number)
3. Do not continue the conversation after initiating transfer
```

#### Example Conversation Configuration

```json
{
  "first_message": "Hello! Welcome to O Cinema. How can I help you today?",
  "context": "You are a helpful assistant for O Cinema theater. You can answer questions about showtimes, movies, and theater information. If you cannot help with something or if the caller wants to speak to staff, transfer them to voicemail using the transfer_to_number tool.",
  "tools": [
    {
      "type": "system",
      "name": "transfer_to_number"
    }
  ]
}
```

### Step 5: Test the Integration

#### Quick Test via Phone
1. Call your ElevenLabs agent phone number
2. Say "I'd like to leave a message"
3. You should hear: "I'll transfer you to our voicemail system..."
4. Call should transfer to Twilio
5. You should hear: "Please leave a detailed message after the beep..."
6. Leave a test message
7. Press `*` when done
8. Check your staff email for notification

#### Automated Testing
```bash
# Check integration status
curl https://your-app.vercel.app/api/debug/integration-status | jq

# Test components
curl https://your-app.vercel.app/api/debug/test-components | jq

# Simulate a call (doesn't actually call, just tests endpoint)
curl "https://your-app.vercel.app/api/debug/test-voicemail?source=twilio" | jq

# Check health
curl https://your-app.vercel.app/api/monitor/voicemail-health | jq
```

---

## Usage

### For Callers

1. Call the ElevenLabs agent
2. Ask to "leave a message" or "speak to staff"
3. Agent transfers to voicemail
4. Leave message after beep
5. Press `*` when finished (or wait 3 minutes for auto-end)

### For Staff

#### View Voicemails
Visit: `https://your-app.vercel.app/api/voicemail/list`

This shows:
- List of all voicemails
- Caller phone number
- Duration
- Transcription (when available)
- Listen/download controls

#### Email Notifications

You'll receive **two emails** per voicemail:

1. **Immediate notification** (when recording completes):
   - Caller's phone number
   - Duration
   - Link to listen to recording
   - "Transcription pending..."

2. **Transcription notification** (1-2 minutes later):
   - Same caller info
   - Full text transcription
   - Link to recording

---

## Architecture

### Data Flow

```
Caller → ElevenLabs Agent → transfer_to_number tool → Twilio Number
         ↓
Twilio Number → Request /api/twilio/voicemail (TwiML)
         ↓
TwiML → Record audio (max 3 min) + Transcribe
         ↓
Recording Complete → POST /api/twilio/voicemail-callback
         ↓
         ├─→ Store in Redis (voicemails:index sorted set)
         ├─→ Send email notification (via Resend)
         └─→ Return TwiML confirmation
         ↓
Transcription Complete → POST /api/twilio/voicemail-transcription
         ↓
         ├─→ Update Redis record with transcription
         └─→ Send transcription email
```

### API Endpoints

| Endpoint | Purpose | Called By |
|----------|---------|-----------|
| `/api/twilio/voicemail` | Returns TwiML for recording | Twilio (when call comes in) |
| `/api/twilio/voicemail-callback` | Handles completed recordings | Twilio (after recording) |
| `/api/twilio/voicemail-transcription` | Handles transcription results | Twilio (after transcription) |
| `/api/twilio/recording-status` | Handles recording status updates | Twilio (status changes) |
| `/api/voicemail/list` | Staff dashboard to view voicemails | Staff/admin |
| `/api/debug/integration-status` | Integration health check | Debugging |
| `/api/debug/test-components` | Component testing | Debugging |
| `/api/debug/test-voicemail` | Simulate calls | Debugging |
| `/api/monitor/voicemail-health` | Health monitoring | Monitoring systems |

### Data Storage (Redis)

**Sorted Set: `voicemails:index`**
- Members: RecordingSid (e.g., `RExxxxxxxxxxxxxxxxxxxxx`)
- Score: Timestamp (for chronological sorting)

**Hash: `voicemail:{RecordingSid}`**
```json
{
  "id": "RExxxxxxxxxxxxxxxxxxxxx",
  "recordingUrl": "https://api.twilio.com/...",
  "duration": 45,
  "callSid": "CAxxxxxxxxxxxxxxxxxxxxx",
  "from": "+15551234567",
  "to": "+15559876543",
  "status": "completed",
  "transcription": "Hello, I would like to...",
  "transcriptionSid": "TRxxxxxxxxxxxxxxxxxxxxx",
  "createdAt": "2025-10-05T10:30:00.000Z",
  "listened": false
}
```

---

## Customization

### Change Voicemail Greeting

Edit `/api/twilio/voicemail.js`:

```javascript
// Line 80-83
voiceResponse.say({
  voice: 'alice',  // Options: alice, man, woman
  language: 'en-US'
}, 'Your custom greeting message here. Press star when finished.');
```

Available voices: `alice`, `man`, `woman`, `Polly.*` (AWS Polly voices)

### Change Recording Duration

Edit `/api/twilio/voicemail.js`:

```javascript
// Line 97
maxLength: 180,  // Change to desired seconds (max: 14400 = 4 hours)
```

### Change Finish Key

Edit `/api/twilio/voicemail.js`:

```javascript
// Line 99
finishOnKey: '*',  // Change to any digit (0-9) or #
```

### Customize Email Template

Edit `/api/utils/voicemail-email.js`:

```javascript
// Lines 58-74 (new voicemail email)
function buildNewVoicemailEmail(voicemail) {
  return {
    from: process.env.FROM_EMAIL || 'O Cinema Voicemail <onboarding@resend.dev>',
    to: process.env.STAFF_EMAIL,
    subject: `New Voicemail from ${escapeHtml(voicemail.from)}`,
    html: `
      <!-- Your custom HTML here -->
    `
  };
}
```

---

## Troubleshooting

### Integration Not Working?

**Quick diagnosis:**
```bash
curl https://your-app.vercel.app/api/debug/integration-status | jq
```

**Common issues:**

1. **Using webhook tool instead of transfer**
   - Solution: Follow setup steps above to use `transfer_to_number`

2. **Missing environment variables**
   - Check: `vercel env ls`
   - Solution: Add missing variables

3. **Twilio number not configured**
   - Check: Twilio Console → Phone Numbers
   - Solution: Set voice URL to voicemail endpoint

4. **No emails received**
   - Check: Resend dashboard for delivery status
   - Check: Spam folder
   - Solution: Verify RESEND_API_KEY and STAFF_EMAIL

5. **Callbacks not firing**
   - Check: Vercel logs (`vercel logs --follow`)
   - Check: Twilio logs (Console → Monitor → Logs)
   - Solution: Verify callback URLs are accessible

**Full troubleshooting guide:** See [TROUBLESHOOTING-VOICEMAIL.md](./TROUBLESHOOTING-VOICEMAIL.md)

---

## Monitoring

### Health Check Endpoint

```bash
curl https://your-app.vercel.app/api/monitor/voicemail-health | jq
```

Returns:
```json
{
  "status": "healthy",
  "checks": {
    "environment": { "status": "healthy" },
    "redis": { "status": "healthy", "latency": "45ms" },
    "voicemailActivity": { "totalVoicemails": 12, "last24Hours": 3 }
  },
  "metrics": {
    "redisLatency": 45,
    "totalVoicemails": 12,
    "voicemailsLast24h": 3,
    "unlistenedVoicemails": 2
  },
  "alerts": []
}
```

### Set Up Monitoring

#### Option 1: Uptime Robot
1. Create HTTP monitor
2. URL: `https://your-app.vercel.app/api/monitor/voicemail-health`
3. Alert on non-200 status
4. Check every 5 minutes

#### Option 2: Vercel Monitoring
```bash
# View recent function invocations
vercel logs --filter "voicemail"

# View errors
vercel logs --filter "error"
```

---

## Security

### Twilio Signature Validation

All callback endpoints validate Twilio signatures to prevent unauthorized requests:

```javascript
// api/twilio/voicemail-callback.js (line 28-38)
const isValidRequest = twilio.validateRequest(
  authToken,
  twilioSignature,
  url,
  req.body
);

if (!isValidRequest) {
  return res.status(403).json({ error: 'Forbidden - Invalid signature' });
}
```

### XSS Protection

All user input (phone numbers, transcriptions) is HTML-escaped before displaying:

```javascript
// api/utils/voicemail-email.js
export function escapeHtml(unsafe) {
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    // ... etc
}
```

### Environment Variables

Never commit secrets to version control. Use Vercel environment variables or `.env.local`:

```bash
# Set via Vercel CLI
vercel env add TWILIO_AUTH_TOKEN production

# Or use .env.local for development
echo "TWILIO_AUTH_TOKEN=your_token" >> .env.local
```

---

## Cost Considerations

### Twilio Costs
- **Phone number:** ~$1.00/month
- **Inbound calls:** ~$0.0085/minute
- **Recording:** $0.0025/minute
- **Transcription:** $0.05 per transcription

**Example monthly cost (100 voicemails, avg 2 min each):**
- Phone number: $1.00
- Inbound minutes: 200 × $0.0085 = $1.70
- Recording: 200 × $0.0025 = $0.50
- Transcription: 100 × $0.05 = $5.00
- **Total: ~$8.20/month**

### Upstash Costs
- **Free tier:** 10,000 commands/day
- Voicemail system uses ~5 commands per voicemail
- **Estimate:** Free for <2000 voicemails/day

### Resend Costs
- **Free tier:** 100 emails/day
- System sends 2 emails per voicemail
- **Estimate:** Free for <50 voicemails/day

---

## API Reference

See detailed API documentation in [CLAUDE.md](./CLAUDE.md#voicemail-integration)

## Support

- **Troubleshooting Guide:** [TROUBLESHOOTING-VOICEMAIL.md](./TROUBLESHOOTING-VOICEMAIL.md)
- **Twilio Docs:** https://www.twilio.com/docs/voice/twiml
- **ElevenLabs Docs:** https://elevenlabs.io/docs/conversational-ai
- **GitHub Issues:** https://github.com/your-repo/issues

---

## License

Same as main project.

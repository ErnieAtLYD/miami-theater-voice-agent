# Troubleshooting Guide

Comprehensive debugging guide for the Miami Theater Voice Agent system.

## Table of Contents

- [Quick Diagnostics](#quick-diagnostics)
- [Voicemail System Issues](#voicemail-system-issues)
- [Showtimes System Issues](#showtimes-system-issues)
- [Redis Connection Problems](#redis-connection-problems)
- [Deployment Issues](#deployment-issues)
- [Environment Variable Issues](#environment-variable-issues)
- [Email Notification Issues](#email-notification-issues)
- [Authentication & Rate Limiting](#authentication--rate-limiting)
- [Debugging Tools](#debugging-tools)
- [Emergency Procedures](#emergency-procedures)

---

## Quick Diagnostics

### Health Check Commands

```bash
# Check if all endpoints respond
curl https://miami-theater-voice-agent.vercel.app/api/showtimes
curl -H "Authorization: Bearer $STAFF_DASHBOARD_SECRET" \
  https://miami-theater-voice-agent.vercel.app/api/voicemail/list

# Check Vercel deployment status
vercel ls

# View recent logs
vercel logs --since 1h
```

### Common Issues → Quick Fixes

| Symptom | Likely Cause | Quick Fix |
|---------|-------------|-----------|
| Empty showtime data | Cron job not running | Manually trigger: `/api/cron/ingest-showtimes` |
| 401 on voicemail callbacks | Wrong BASE_URL | Set BASE_URL in env vars |
| Empty req.body in Twilio | Missing bodyParser | Add `export const config = { api: { bodyParser: true } }` |
| Wrong "today" date | Timezone issue | Use `getEasternTimeDate()` |
| Environment var has newlines | Used echo instead of printf | Re-set with `printf '%s' "value"` |

---

## Voicemail System Issues

### Getting "Application Error" When Calling

If you're getting an "application error" message from Twilio when calling the voicemail number, follow these debugging steps:

### Step 1: Check Twilio Debugger

Go to: https://console.twilio.com/us1/monitor/logs/debugger

Look for the most recent error and check:
- **Error Code**: What specific error is Twilio reporting?
- **Request URL**: Is it calling the correct endpoint?
- **Response**: What did your server return?

Common error codes:
- **11200**: HTTP retrieval failure - Your endpoint is unreachable
- **11205**: HTTP connection failure - Network timeout
- **11210**: HTTP bad host name - Domain doesn't resolve
- **12100**: Document parse failure - Invalid TwiML response
- **13227**: Invalid HTTP status code

### Step 2: Test Endpoint Directly

```bash
curl -X POST "https://miami-theater-voice-agent.vercel.app/api/twilio/voicemail" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "CallSid=CAtest&From=%2B15551234567"
```

Expected response: Valid TwiML XML starting with `<?xml version="1.0" encoding="UTF-8"?><Response>`

### Step 3: Check Twilio Phone Number Configuration

Go to: https://console.twilio.com/us1/develop/phone-numbers/manage/incoming

Select your phone number and verify:

**Voice Configuration:**
- **Configure with**: Webhook
- **A call comes in**: Webhook
- **URL**: `https://miami-theater-voice-agent.vercel.app/api/twilio/voicemail`
- **HTTP**: POST

### Step 4: Verify Environment Variables

Required variables in Vercel:
```
✅ TWILIO_ACCOUNT_SID
✅ TWILIO_AUTH_TOKEN
✅ RESEND_API_KEY
✅ OCINEMA_EMAIL (or STAFF_EMAIL)
✅ STAFF_DASHBOARD_SECRET
✅ BASE_URL
✅ UPSTASH_REDIS_REST_URL
✅ UPSTASH_REDIS_REST_TOKEN
✅ KV_REST_API_URL
```

Check with:
```bash
vercel env ls
```

### Step 5: Check Vercel Logs

```bash
vercel logs miami-theater-voice-agent.vercel.app --follow
```

Then call the number and watch for errors in real-time.

### Step 6: Common Issues and Solutions

#### Issue: "Document parse failure"
**Solution**: TwiML response is malformed. Check for proper XML structure.

#### Issue: "HTTP retrieval failure"
**Solution**: Endpoint is returning non-200 status. Check for errors in handler.

#### Issue: "Invalid signature" in logs
**Solution**: TWILIO_AUTH_TOKEN doesn't match. Verify it's correct in Vercel env vars.

#### Issue: Body is empty in callback handlers
**Solution**: Ensure `export const config = { api: { bodyParser: true } }` is set.

#### Issue: URLs in TwiML point to deployment URLs
**Solution**: Set `BASE_URL=https://miami-theater-voice-agent.vercel.app` in all environments.

### Step 7: Test Complete Flow

Run the test script:
```bash
node --env-file=.env.local test-voicemail-flow.js
```

This simulates a complete voicemail recording + transcription flow.

### Need More Help?

1. Share the exact error code from Twilio Debugger
2. Share the Vercel logs output
3. Confirm your Twilio webhook URL configuration

### Additional Voicemail Issues

#### No Email Notifications

**Diagnosis:**
```bash
# Verify environment variables
vercel env pull
cat .env.production.local | grep -E "(RESEND|EMAIL)"

# Check email sending logs
vercel logs api/twilio/voicemail-callback --since 1h | grep -i email
```

**Solutions:**

| Problem | Solution |
|---------|----------|
| Missing RESEND_API_KEY | Set in Vercel env vars |
| Missing STAFF_EMAIL | Set recipient email address |
| Invalid FROM_EMAIL | Use verified domain or onboarding@resend.dev |
| Email sending fails silently | Check Resend dashboard at resend.com/emails |

#### Voicemails Not Appearing in Dashboard

**Diagnosis:**
```bash
# Check Redis data via Upstash Console
ZRANGE voicemails:index 0 -1
GET voicemail:RExxxxxx

# Check dashboard authentication
curl -H "Authorization: Bearer $STAFF_DASHBOARD_SECRET" \
  https://miami-theater-voice-agent.vercel.app/api/voicemail/list
```

**Solutions:**

| Problem | Solution |
|---------|----------|
| Empty `voicemails:index` | Voicemails not being saved - check callback logs |
| Dashboard returns 401 | Check STAFF_DASHBOARD_SECRET matches (format: `Bearer secret`) |
| Dashboard returns empty array | Check Redis connection |

---

## Showtimes System Issues

### No Showtime Data Available

**Symptom:**
```json
{
  "error": "Showtime data unavailable. Please try again in a few minutes."
}
```

**Diagnosis:**

1. **Check Redis cache:**
```bash
# Via Upstash Console
GET showtimes:current
GET showtimes:last_updated
```

2. **Check cron job execution:**
```bash
# View cron job logs
vercel logs api/cron/ingest-showtimes --since 2h

# Manually trigger cron
curl -X GET \
  "https://miami-theater-voice-agent.vercel.app/api/cron/ingest-showtimes" \
  -H "Authorization: Bearer $CRON_SECRET"
```

3. **Check Agile API connection:**
```bash
# Test direct API access
curl "https://prod3.agileticketing.net/websales/feed.ashx?guid=$AGILE_GUID&showslist=true&format=json&v=latest"
```

**Solutions:**

| Problem | Solution |
|---------|----------|
| Redis key doesn't exist | Run cron manually, check CRON_SECRET is correct |
| Agile API returns 401 | Verify AGILE_GUID is correct in env vars |
| Agile API returns empty | Theater may not have published showtimes yet |
| Cron job not executing | Check vercel.json has correct schedule |

### Cron Job Not Running

**Symptom:** Last updated timestamp is hours/days old

**Diagnosis:**
```bash
# Check if cron is configured
cat vercel.json

# Should show:
# {
#   "crons": [{
#     "path": "/api/cron/ingest-showtimes",
#     "schedule": "*/30 * * * *"
#   }]
# }

# Check Vercel cron logs
vercel logs api/cron/ingest-showtimes --since 24h
```

**Solutions:**

1. **Verify cron is enabled in Vercel:**
   - Vercel Dashboard → Your Project → Settings → Cron Jobs
   - Cron jobs require Pro plan

2. **Increase function timeout if needed:**
```json
{
  "functions": {
    "api/cron/*.js": {
      "maxDuration": 60
    }
  }
}
```

### Wrong Showtimes Returned (Timezone Issues)

**Symptom:** "Today" returns yesterday's or tomorrow's showtimes

**Diagnosis:**
```javascript
// Add debug logging to api/showtimes.js
console.log('Server time (UTC):', new Date().toISOString());
console.log('Eastern time:', getEasternTimeISO());
console.log('Today string:', formatDateYYYYMMDD(getEasternTimeDate()));
```

**Solution:**

Ensure you're using Eastern Time consistently:

```javascript
// ❌ WRONG - Uses server's UTC time
const today = new Date().toISOString().split('T')[0];

// ✅ RIGHT - Uses Eastern Time
const todayET = getEasternTimeDate();
const today = formatDateYYYYMMDD(todayET);
```

### Filtered Queries Return Empty Results

**Symptom:** `?time_preference=evening` returns no results despite evening showtimes existing

**Diagnosis:**
```javascript
// Add logging to api/showtimes.js
console.log('Filtering with preference:', time_preference);
console.log('Before filter:', results.length);
console.log('After filter:', filtered.length);
console.log('Sample time:', results[0]?.showtime?.time);
```

**Solution:** Ensure times are in 12-hour format ("7:30 PM") not 24-hour ("19:30")

---

## Redis Connection Problems

### Redis Connection Timeout

**Symptom:**
```
Error: Connection timeout at Redis.connect
```

**Diagnosis:**
```bash
# Test Redis connection directly
curl "https://YOUR_REDIS_URL/get/test" \
  -H "Authorization: Bearer YOUR_REDIS_TOKEN"

# Verify environment variables
vercel env pull
cat .env.production.local | grep -E "KV_REST|UPSTASH"
```

**Solutions:**

1. **Create test endpoint:** `api/test/redis.js`
```javascript
import { createRedisClient } from '../utils/redis-client.js';

export default async function handler(req, res) {
  try {
    const redis = createRedisClient();
    await redis.set('test:connection', 'working');
    const value = await redis.get('test:connection');

    return res.status(200).json({
      success: true,
      value: value,
      hasUrl: !!process.env.KV_REST_API_URL,
      hasToken: !!process.env.KV_REST_API_TOKEN
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
```

2. **Check Upstash dashboard:**
   - Go to console.upstash.com
   - Select your database
   - Verify URL matches environment variable

### Wrong Redis Environment

**Symptom:** Local development shows production data

**Solution:** Use separate Redis databases:

```bash
# .env.local (for development)
KV_REST_API_URL=https://dev-redis.upstash.io
KV_REST_API_TOKEN=dev_token_here

# Production uses Vercel environment variables
```

---

## Deployment Issues

### Deployment Succeeds But Changes Not Visible

**Symptom:** Code changes deployed but old version still running

**Solutions:**

1. **Clear Vercel cache:**
```bash
vercel --force --prod
```

2. **Check deployment logs:**
```bash
vercel logs --since 10m
```

3. **Verify production deployment:**
```bash
vercel ls
# Find your deployment and verify it's assigned to production
```

### Function Timeout

**Symptom:**
```
Error: Function execution timeout
Task timed out after 10.00 seconds
```

**Solutions:**

1. **Increase timeout in vercel.json:**
```json
{
  "functions": {
    "api/slow-endpoint.js": {
      "maxDuration": 60
    }
  }
}
```

2. **Add timing logs to identify slow operations:**
```javascript
export default async function handler(req, res) {
  const start = Date.now();

  // ... your code ...

  console.log('Execution time:', Date.now() - start, 'ms');
  return res.status(200).json({ ... });
}
```

---

## Environment Variable Issues

### Variable Contains Newline Character

**Symptom:** Redis URL has `\n` at the end, causing connection failures

**Diagnosis:**
```bash
# Check for hidden characters
vercel env pull
cat -A .env.production.local | grep REDIS_URL
```

**Solution:**
```bash
# ❌ WRONG - Adds newline
echo "https://redis.upstash.io" | vercel env add KV_REST_API_URL production

# ✅ RIGHT - No newline
printf '%s' "https://redis.upstash.io" | vercel env add KV_REST_API_URL production
```

**Fix existing variable:**
```bash
# Remove variable
vercel env rm KV_REST_API_URL production

# Re-add with printf
printf '%s' "https://your-redis.upstash.io" | vercel env add KV_REST_API_URL production

# Redeploy
vercel --prod
```

### Variable Not Available in Function

**Symptom:** Variable shows in `vercel env ls` but `process.env.VAR` is undefined

**Solutions:**

1. **Check environment scope:**
```bash
vercel env ls production  # For production
vercel env ls preview     # For preview deployments
vercel env ls development # For local dev
```

2. **Redeploy after adding variable:**
```bash
vercel --prod
```

3. **Pull variables locally for development:**
```bash
vercel env pull .env.local
```

---

## Email Notification Issues

### Emails Not Sending

**Diagnosis:**
```bash
# Check Resend logs at: https://resend.com/emails

# Test email API
curl -X POST 'https://api.resend.com/emails' \
  -H "Authorization: Bearer $RESEND_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "from": "test@resend.dev",
    "to": "your-email@example.com",
    "subject": "Test",
    "text": "Test email"
  }'
```

**Solutions:**

| Problem | Solution |
|---------|----------|
| Invalid API key | Regenerate at resend.com/api-keys |
| Invalid FROM_EMAIL | Use verified domain or default onboarding@resend.dev |
| Missing STAFF_EMAIL | Set recipient email address in env vars |

### Emails Go to Spam

**Solutions:**

1. **Set up SPF and DKIM records** (if using custom domain)
   - Resend → Domains → Your Domain
   - Follow DNS configuration instructions

2. **Use verified domain:**
```javascript
from: 'voicemail@your-verified-domain.com'
```

---

## Authentication & Rate Limiting

### Dashboard Returns 401

**Diagnosis:**
```bash
# Test authentication
curl -v \
  -H "Authorization: Bearer $STAFF_DASHBOARD_SECRET" \
  https://miami-theater-voice-agent.vercel.app/api/voicemail/list
```

**Solutions:**

1. **Verify header format:**
```bash
# ✅ Correct
Authorization: Bearer your_secret_here

# ❌ Wrong
Authorization: your_secret_here
```

2. **Regenerate secret if needed:**
```bash
openssl rand -base64 32
# Copy output and set as STAFF_DASHBOARD_SECRET
```

### Rate Limit Blocking Legitimate Users

**Symptom:** Staff gets 429 Too Many Requests

**Solutions:**

1. **Clear rate limit for IP via Redis:**
```bash
# In Upstash Console
DEL rate-limit:auth:123.45.67.89
```

2. **Adjust rate limit thresholds:**
```javascript
// In api/utils/rate-limit-auth.js
const MAX_ATTEMPTS = 10;  // Increase from 5
```

---

## Debugging Tools

### Vercel Logs

```bash
# Real-time logs
vercel logs --follow

# Specific function
vercel logs --follow api/showtimes

# Since specific time
vercel logs --since 1h

# Filter by error
vercel logs | grep "ERROR"
```

### Redis Debugging

**Via Upstash Console:**
```bash
# List all keys
KEYS *

# Get specific key
GET showtimes:current

# Check sorted set
ZRANGE voicemails:index 0 -1 WITHSCORES

# Delete test data
DEL test:*
```

### Local Testing

```bash
# Start local server
vercel dev

# Test with curl
curl "http://localhost:3000/api/showtimes?day_type=today"

# Test with authentication
curl -H "Authorization: Bearer $STAFF_DASHBOARD_SECRET" \
  "http://localhost:3000/api/voicemail/list"
```

### Network Debugging

**Test with ngrok for Twilio webhooks:**
```bash
# Install ngrok
npm install -g ngrok

# Expose local server
ngrok http 3000

# Use ngrok URL in Twilio Console
# https://abc123.ngrok.io/api/twilio/voicemail
```

**Check CORS:**
```bash
curl -X OPTIONS \
  -H "Origin: https://elevenlabs.io" \
  -H "Access-Control-Request-Method: POST" \
  https://miami-theater-voice-agent.vercel.app/api/showtimes \
  -v

# Should see Access-Control-Allow-Origin: *
```

---

## Emergency Procedures

### Complete System Reset

**When everything is broken:**

```bash
# 1. Clear Redis cache (via Upstash Console)
FLUSHDB

# 2. Manually trigger data ingestion
curl -X GET \
  "https://miami-theater-voice-agent.vercel.app/api/cron/ingest-showtimes" \
  -H "Authorization: Bearer $CRON_SECRET"

# 3. Verify data
curl "https://miami-theater-voice-agent.vercel.app/api/showtimes"

# 4. Test voicemail system
curl -X POST https://miami-theater-voice-agent.vercel.app/api/twilio/voicemail
```

### Rollback Deployment

```bash
# List deployments
vercel ls

# Promote previous deployment
vercel promote <previous-deployment-url>
```

### Contact Support

**Vercel:** vercel.com/support | Status: vercel-status.com
**Upstash:** support@upstash.com | Console: console.upstash.com
**Twilio:** twilio.com/console/support | Status: status.twilio.com
**Resend:** support@resend.com | Status: resend.com/status

---

## Prevention Checklist

### Before Deploying

- [ ] Run `npm test` - all tests pass
- [ ] Test locally with `vercel dev`
- [ ] Check environment variables are set correctly
- [ ] Verify API credentials are valid
- [ ] Review code changes for security issues

### After Deploying

- [ ] Test production endpoints
- [ ] Check Vercel logs for errors
- [ ] Verify cron job ran successfully
- [ ] Test voicemail by calling phone number
- [ ] Check dashboard loads correctly

### Weekly Maintenance

- [ ] Review error logs
- [ ] Check Redis memory usage
- [ ] Verify cron jobs running on schedule
- [ ] Test email notifications
- [ ] Monitor API response times

---

**For detailed explanations:** See TUTORIAL.md
**For code patterns:** See QUICK_REFERENCE.md
**For project context:** See CLAUDE.md

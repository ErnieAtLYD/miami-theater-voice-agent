# Troubleshooting ElevenLabs-Twilio Voicemail Integration

## Quick Diagnosis

**If your voicemail integration is failing, start here:**

### Check Integration Status
```bash
curl https://your-app.vercel.app/api/debug/integration-status
```

This will show you:
- ✅ Configuration status
- ✅ Environment variables
- ✅ Redis connectivity
- ⚠️ Architecture warnings

### Common Symptoms

| Symptom | Likely Cause | Quick Fix |
|---------|--------------|-----------|
| "Nothing happens when user asks to leave voicemail" | Architecture issue - using webhook tool instead of transfer | See [Architecture Fix](#architecture-issue-root-cause) |
| "Endpoint called but returns XML/TwiML" | ElevenLabs calling voicemail endpoint directly | Same as above |
| "Callbacks not being received" | Callback URL construction issue | Check Vercel logs for URL construction |
| "No email notifications" | Missing Resend/email config | Check environment variables |
| "Recordings not saved" | Redis connection issue | Check Redis credentials |

---

## Architecture Issue (Root Cause)

### The Problem

**Current implementation uses a webhook tool, which CANNOT transfer calls.**

```json
// ❌ DOES NOT WORK
{
  "type": "webhook",
  "name": "Leave-Voicemail",
  "api_schema": {
    "url": "https://your-app.vercel.app/api/twilio/voicemail"
  }
}
```

**Why it fails:**
1. ElevenLabs webhook tools make HTTP requests and expect **JSON responses**
2. The `/api/twilio/voicemail` endpoint returns **TwiML (XML)**
3. ElevenLabs cannot process TwiML or transfer calls via webhook tools
4. The call never reaches Twilio's recording system

### The Solution

**Use ElevenLabs' `transfer_to_number` system tool instead:**

#### Step 1: Get a Twilio Phone Number

```bash
# Via Twilio Console or CLI
twilio phone-numbers:buy:mobile --country-code US
```

Note the purchased number (e.g., `+15551234567`)

#### Step 2: Configure Twilio Number

In Twilio Console:
1. Go to Phone Numbers → Manage → Active numbers
2. Click on your voicemail number
3. Under "Voice & Fax", set:
   - **A CALL COMES IN:** Webhook
   - **URL:** `https://your-app.vercel.app/api/twilio/voicemail`
   - **HTTP:** POST
4. Save

#### Step 3: Configure ElevenLabs Agent

In ElevenLabs dashboard:
1. Go to your Conversational AI agent
2. Enable **System Tools** → `transfer_to_number`
3. Update agent's **System Prompt** to include:

```
When the caller asks to leave a message or speak to staff:
1. Say: "Let me transfer you to our voicemail system. Please hold."
2. Use the transfer_to_number tool
3. Transfer to: +15551234567 (your Twilio voicemail number)
```

#### Step 4: Test

Call your ElevenLabs agent and ask to leave a voicemail. The call should:
1. Agent acknowledges the request
2. Call transfers to Twilio number
3. Twilio number requests `/api/twilio/voicemail`
4. TwiML plays greeting and records message
5. Callbacks fire to store recording in Redis
6. Email notification sent to staff

---

## Debugging Tools

### 1. Integration Status Check
```bash
curl https://your-app.vercel.app/api/debug/integration-status | jq
```

Shows:
- Environment configuration
- Redis connectivity
- Recent voicemail count
- Architecture warnings

### 2. Component Testing
```bash
# Test all components
curl https://your-app.vercel.app/api/debug/test-components | jq

# Test specific component
curl "https://your-app.vercel.app/api/debug/test-components?component=redis" | jq
curl "https://your-app.vercel.app/api/debug/test-components?component=twiml" | jq
curl "https://your-app.vercel.app/api/debug/test-components?component=email" | jq
```

### 3. Simulate Voicemail Call
```bash
# Simulate ElevenLabs webhook call
curl "https://your-app.vercel.app/api/debug/test-voicemail?source=elevenlabs" | jq

# Simulate Twilio call
curl "https://your-app.vercel.app/api/debug/test-voicemail?source=twilio" | jq
```

### 4. Health Monitoring
```bash
curl https://your-app.vercel.app/api/monitor/voicemail-health | jq
```

Returns:
- Health status
- Metrics (latency, voicemail counts)
- Active alerts
- Unlistened voicemail count

---

## Configuration Issues

### Missing Environment Variables

**Symptoms:**
- "Server configuration error" responses
- "Email notification skipped" in logs
- Redis connection failures

**Check:**
```bash
vercel env ls
```

**Required variables:**
```bash
# Twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token

# Redis (Upstash)
KV_REST_API_URL=https://your-redis.upstash.io
KV_REST_API_TOKEN=your_token
# OR
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_token

# Email (Resend)
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxx
STAFF_EMAIL=staff@example.com
FROM_EMAIL=voicemail@example.com  # optional

# Base URL (optional, auto-detected from Vercel)
BASE_URL=https://your-app.vercel.app
```

**Fix:**
```bash
vercel env add TWILIO_ACCOUNT_SID
vercel env add TWILIO_AUTH_TOKEN
# ... etc
```

### Callback URL Issues

**Symptoms:**
- Twilio shows errors like "Invalid URL"
- Callbacks never fire
- Double `https://https://` in logs

**Check logs:**
```bash
vercel logs --follow
# Look for "Base URL constructed:" and "Callback URLs configured:"
```

**Common issues:**
1. `VERCEL_URL` includes `https://` (it shouldn't)
2. `BASE_URL` set incorrectly
3. Callback URLs point to wrong domain

**Fix:**
The improved code now handles this correctly:
```javascript
// voicemail.js lines 36-46
let baseUrl;
if (process.env.BASE_URL) {
  baseUrl = process.env.BASE_URL;  // Use as-is if explicitly set
} else if (process.env.VERCEL_URL) {
  baseUrl = `https://${process.env.VERCEL_URL}`;  // Add protocol
} else if (req.headers.host) {
  baseUrl = `https://${req.headers.host}`;
}
```

---

## Twilio Callback Issues

### Callbacks Not Received

**Check Twilio logs:**
1. Go to Twilio Console → Monitor → Logs → Errors
2. Look for webhook failures to your endpoints

**Common causes:**

| Error | Cause | Fix |
|-------|-------|-----|
| 11200 | HTTP retrieval failure | Check endpoint is accessible publicly |
| 11205 | Invalid URL | Verify callback URLs are well-formed |
| 12200 | Schema validation failed | Check TwiML is valid XML |
| 13227 | Invalid signature | Signature validation failing (expected for non-Twilio calls) |

**Bypass signature validation for testing:**

*Temporarily* comment out signature validation in callbacks:
```javascript
// api/twilio/voicemail-callback.js line 28-38
// if (!isValidRequest) {
//   console.error('Invalid Twilio signature');
//   return res.status(403).json({ error: 'Forbidden - Invalid signature' });
// }
```

**⚠️ Re-enable for production!**

### Recording Not Saved

**Symptoms:**
- `/api/voicemail/list` shows no recordings
- No email received
- Logs show "Recording callback received" but no storage

**Debug:**
1. Check Redis connection:
```bash
curl "https://your-app.vercel.app/api/debug/test-components?component=redis"
```

2. Check Vercel logs for callback:
```bash
vercel logs --filter "Recording callback received"
```

3. Manually check Redis:
```javascript
// In Node.js console or test endpoint
const redis = new Redis({ url, token });
const voicemails = await redis.zrange('voicemails:index', 0, -1);
console.log(voicemails);
```

---

## Email Notification Issues

### No Emails Received

**Check:**
1. Environment variables:
```bash
vercel env ls | grep -E "(RESEND|EMAIL)"
```

2. Resend dashboard for delivery status
3. Spam folder
4. Logs for email errors:
```bash
vercel logs --filter "email"
```

**Common issues:**

| Issue | Symptom | Fix |
|-------|---------|-----|
| Invalid API key | "Resend API error: Unauthorized" | Check RESEND_API_KEY |
| Invalid email format | "Resend API error: Invalid email" | Validate STAFF_EMAIL |
| Domain not verified | "Domain not verified" | Use resend.dev domain or verify custom domain |
| Rate limit | "Too many requests" | Check Resend plan limits |

**Test email directly:**
```bash
curl -X POST "https://your-app.vercel.app/api/debug/test-email" \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

---

## Monitoring & Logs

### Check Logs in Real-Time

```bash
# All logs
vercel logs --follow

# Filter voicemail-related
vercel logs --follow | grep -i voicemail

# Filter errors only
vercel logs --follow | grep -i error
```

### Key Log Messages

**Successful flow:**
```
=== VOICEMAIL ENDPOINT CALLED ===
{
  "method": "POST",
  "headers": { ... },
  "body": { "From": "+15551234567", ... }
}
Base URL constructed: https://your-app.vercel.app
Callback URLs configured: { ... }
TwiML Response generated: <?xml version="1.0" ...
=== END VOICEMAIL ENDPOINT ===
```

```
Recording callback received: { RecordingSid: "RExxxxx", ... }
Transcription callback received: { TranscriptionSid: "TRxxxxx", ... }
new email sent successfully: em_xxxxx
transcription email sent successfully: em_yyyyy
```

**Failure indicators:**
```
=== VOICEMAIL ENDPOINT ERROR ===
Invalid Twilio signature
TWILIO_AUTH_TOKEN not configured
Redis connection failed
Resend API error: ...
```

---

## Testing Checklist

### Pre-Flight Checks
- [ ] All environment variables set
- [ ] Twilio account has active phone number
- [ ] Redis connection works
- [ ] Resend API key valid
- [ ] Staff email is correct

### Integration Test
1. [ ] Call ElevenLabs agent
2. [ ] Ask to leave a message
3. [ ] Verify transfer happens
4. [ ] Leave test voicemail
5. [ ] Press * to finish
6. [ ] Check email for notification
7. [ ] Visit `/api/voicemail/list`
8. [ ] Verify recording appears
9. [ ] Wait for transcription email
10. [ ] Verify transcription appears in dashboard

### Component Tests
```bash
# Run all tests
curl https://your-app.vercel.app/api/debug/test-components | jq '.summary'

# Should show:
# {
#   "total": 5,
#   "passed": 5,
#   "failed": 0,
#   "overallStatus": "healthy"
# }
```

---

## Advanced Troubleshooting

### Twilio Signature Validation Failing

**Context:** All callback endpoints validate Twilio signatures for security.

**Debug:**
```javascript
// Add to callback endpoint temporarily
console.log('Signature validation:', {
  authToken: authToken ? 'present' : 'missing',
  signature: twilioSignature,
  url: url,
  body: req.body
});
```

**Common causes:**
1. Wrong auth token in environment
2. Vercel processing body differently (JSON vs form-encoded)
3. Proxy/CDN modifying request

**Fix:**
1. Verify auth token matches Twilio console
2. Check body parsing in Vercel
3. Ensure callbacks come directly from Twilio

### Redis Connection Issues

**Symptoms:**
- Timeouts
- "Connection refused"
- Intermittent failures

**Debug:**
```bash
# Test Redis directly
curl "https://your-app.vercel.app/api/debug/test-components?component=redis"
```

**Common causes:**
1. Incorrect credentials
2. IP allowlist (Upstash)
3. Network issues
4. Rate limiting

**Fix:**
1. Regenerate Redis credentials
2. Check Upstash dashboard for IP restrictions
3. Add Vercel IPs to allowlist if needed

### Base URL / Callback URL Issues

**Debug via test endpoint:**
```bash
curl "https://your-app.vercel.app/api/debug/test-voicemail?source=twilio" | jq '.response.body'
```

Check the TwiML for correct callback URLs:
```xml
<Record action="https://your-app.vercel.app/api/twilio/voicemail-callback" ...>
```

**Verify:**
- No double `https://https://`
- Correct domain
- Correct path

---

## Migration from Webhook to Transfer Tool

### Current State Assessment
```bash
# Check if you're using the broken webhook approach
grep -r "webhook.*Leave-Voicemail" elevenlabs/
```

### Migration Steps

1. **Get Twilio number** (if you don't have one)
   ```bash
   twilio phone-numbers:buy:mobile --country-code US
   ```

2. **Configure Twilio number**
   - Voice URL: `https://your-app.vercel.app/api/twilio/voicemail`
   - HTTP POST

3. **Update ElevenLabs agent**
   - Remove webhook tool "Leave-Voicemail"
   - Enable system tool `transfer_to_number`
   - Update prompt to use transfer tool

4. **Test**
   ```bash
   # Run integration test
   curl https://your-app.vercel.app/api/monitor/voicemail-health | jq
   ```

5. **Verify no architecture warnings**

---

## Getting Help

### Collect Diagnostic Information

```bash
# Create diagnostic report
{
  echo "=== Integration Status ==="
  curl -s https://your-app.vercel.app/api/debug/integration-status | jq

  echo -e "\n=== Component Tests ==="
  curl -s https://your-app.vercel.app/api/debug/test-components | jq

  echo -e "\n=== Health Check ==="
  curl -s https://your-app.vercel.app/api/monitor/voicemail-health | jq

  echo -e "\n=== Recent Logs ==="
  vercel logs --since 1h
} > voicemail-diagnostics.txt
```

### Support Resources

- **Twilio Docs:** https://www.twilio.com/docs/voice/twiml
- **ElevenLabs Docs:** https://elevenlabs.io/docs/conversational-ai
- **Vercel Docs:** https://vercel.com/docs/functions/serverless-functions
- **Upstash Redis Docs:** https://docs.upstash.com/redis

### Common Questions

**Q: Can I test voicemail without calling?**
A: Yes, use the test endpoints:
```bash
curl "https://your-app.vercel.app/api/debug/test-voicemail?source=twilio"
```

**Q: Why does the webhook tool not work?**
A: Webhook tools can only make HTTP requests and receive JSON. They cannot transfer calls or process TwiML.

**Q: Can I use this with other voice providers?**
A: Yes, any provider that can transfer calls to a Twilio number will work.

**Q: How do I delete old voicemails?**
A: Use Redis CLI or create an admin endpoint to remove entries from `voicemails:index` sorted set.

**Q: Can I customize the voicemail greeting?**
A: Yes, edit `/api/twilio/voicemail.js` lines 80-83.

---

## Summary

### Root Cause
The integration fails because it uses a **webhook tool** which cannot transfer calls. ElevenLabs webhook tools expect JSON, but the endpoint returns TwiML.

### Solution
Use the **`transfer_to_number` system tool** to transfer calls to a Twilio number configured to request the TwiML endpoint.

### Quick Start
1. Get Twilio number
2. Configure number → point to voicemail endpoint
3. Enable `transfer_to_number` in ElevenLabs
4. Update agent prompt to transfer
5. Test

### Debug Endpoints
- `/api/debug/integration-status` - Overall status
- `/api/debug/test-components` - Test individual components
- `/api/debug/test-voicemail` - Simulate calls
- `/api/monitor/voicemail-health` - Health metrics

### Need More Help?
Run the diagnostic report and check Vercel/Twilio logs for detailed error messages.

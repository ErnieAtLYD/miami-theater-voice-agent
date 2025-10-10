# Voicemail System Troubleshooting

## Getting "Application Error" When Calling

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

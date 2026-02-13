# O Cinema Voice AI Agent - Case Study

> A multilingual phone system that brings Miami's independent art-house cinema into the age of AI—without losing the human touch.

## The Challenge

**Client:** O Cinema, Miami's premier independent art-house theater
**Timeline:** September - October, 2025
**Project Type:** Voice AI system rebuild

### The Business Problem

O Cinema had no working phone system. None.

When potential customers called to ask about showtimes, parking, or ticket prices, they got silence. No ring, no voicemail, no way to reach anyone. The only contact option was email—which meant:

**Lost revenue:**
- Tourists unfamiliar with online ticketing couldn't get information
- Older patrons who prefer calling had no way to plan their visit
- Spanish and Creole-speaking families faced language barriers on the website

**Accessibility failure:**
- A theater built on inclusion couldn't serve non-digital audiences
- Business hours-only communication meant no after-hours information
- Single-language support (English website) excluded Miami's multilingual community

**Operational inefficiency:**
- Staff fielded the same questions repeatedly via email
- No automated way to provide basic information (showtimes, location, parking)
- Lost the scrappy Twilio IVR system they had from 2018-2022 during a website rebuild

### The Core Question

**How do you give a small, independent theater 24/7 multilingual phone support without hiring staff or managing infrastructure?**

The answer: Build a voice AI agent that sounds human, speaks three languages, and costs less per month than a movie ticket.

---

## The Solution

### What I Delivered

A **24/7 multilingual AI phone agent** that gives O Cinema the capabilities of a full-time receptionist—for about $35/month.

**Core capabilities:**
- **Answers calls in 3 languages** (English, Spanish, Haitian Creole)
- **Provides real-time showtimes** synced with their ticketing system every 30 minutes
- **Records voicemails** with automatic transcription and staff email notifications
- **Handles natural questions** like "What's playing tonight?" or "Is there parking?"
- **Never needs training or vacation** — available 24/7, every day of the year

**Business outcomes:**
- Zero staffing costs for phone support
- Expanded accessibility for non-English speakers
- After-hours availability for tourists and night-shift workers
- Automated answers to repetitive questions (freeing staff for complex inquiries)

**Timeline:** 3 weeks from initial conversation to production deployment

**Call the system yourself:** (786) 207-1919

### How It Works (Technical Overview)

**The stack:**
- **Vercel (serverless hosting)** - Zero infrastructure management, automatic scaling
- **ElevenLabs** - Human-quality multilingual voice synthesis
- **Twilio** - Phone system integration and call routing
- **Upstash Redis** - Caching layer for fast responses
- **Agile WebSales API** - O Cinema's existing ticketing system (data source)

**Why these choices:**

**Serverless = No ongoing maintenance**
O Cinema doesn't have a dev team. Vercel means no servers to patch, monitor, or scale. Deploy once, runs forever (until something breaks, then I fix it).

**ElevenLabs = Brand personality**
The voices sound natural, not robotic. Critical for an arts organization that values human connection. Spanish and Creole support was non-negotiable.

**Redis caching = Speed + cost control**
The ticketing API is slow (3-5 seconds) and rate-limited. Caching gives sub-100ms responses and prevents API overages. Data updates every 30 minutes—fresh enough for showtimes.

**Cost implications:**
- Serverless architecture means O Cinema only pays for actual usage
- No minimum monthly commitments or enterprise contracts
- Predictable costs that scale with call volume

---

## Real Problems I Solved

### Problem 1: Wrong Showtimes Could Cost Ticket Sales

**Business impact:** O Cinema staff discovered the voice agent was announcing incorrect showtimes—off by 4-5 hours. If a customer called asking "What's showing this weekend?" and heard "9:30 AM" instead of "1:30 PM," they'd assume the theater was closed or the system was broken.

**Risk:**
- Lost ticket sales from confused customers
- Damage to O Cinema's reputation
- Staff losing trust in the automated system

**Resolution:** Identified, fixed, and deployed the correction within 4 hours of the bug report.

**Root cause:** Classic timezone double-conversion bug. The `formatTimeEastern` function was treating incoming datetime values as UTC and converting them to Eastern Time, even though the AgileTix API already returns times in Eastern Time.

**The debugging process:**

1. Verified the data source (AgileTix API) was returning correct times
2. Traced the data pipeline to find where corruption happened
3. Found the bug: JavaScript's `Date` constructor was treating timezone-less strings as UTC, then converting to Eastern (double conversion = 4-5 hour offset)
4. Fixed it by parsing the time string directly instead of using `Date` objects
5. Deployed, tested, confirmed with client

**Key lesson:** Timezone assumptions are invisible until they break. The bug was silent for weeks because my unit tests used synthetic UTC timestamps—but production data was already in Eastern Time. Testing with real production data would have caught this immediately.

**Technical details:** See `api/utils/timezone.js:formatTimeEastern` ([commit 8638c62](https://github.com/ErnieAtLYD/miami-theater-voice-agent/commit/8638c62))

### Problem 2: Voicemails Silently Disappearing in Production

**Business impact:** The voicemail system worked perfectly in testing, but failed silently in production. Staff received no notifications when customers left messages. Voicemails were lost.

**Risk:**
- Missed customer inquiries (potential ticket sales, accessibility questions)
- No record of who called or why
- System appeared functional but was actually broken

**Resolution:** Debugged serverless webhook validation issue, fixed URL construction, deployed correction within same day.

**Root cause:** Vercel's reverse proxy modifies request headers in ways that break Twilio's cryptographic webhook signature validation. The error (HTTP 401) was misleading—it suggested authentication failure, but the actual problem was URL construction for signature verification.

**The debugging challenge:**
- Local testing (`vercel dev`) worked perfectly because it doesn't use production proxy headers
- The validation failure was silent—logs showed 401 but not why
- Twilio documentation assumes traditional servers, not serverless functions behind proxies

**The fix:**
1. Used Vercel's `x-forwarded-proto` and `x-forwarded-host` headers instead of assumptions
2. Stripped query parameters from URL (Twilio includes params in POST body, not signature URL)
3. Added comprehensive logging to all webhook endpoints for future debugging
4. Updated all three voicemail endpoints with the correction

**Key lesson:** Serverless environments introduce complexity that "just works" examples don't cover. When webhooks fail in production but work locally, check your proxy headers. Add detailed logging before you need it—debugging production issues without visibility wastes hours.

**Technical details:** See `api/twilio/voicemail-callback.js` ([commits 0885d3c](https://github.com/ErnieAtLYD/miami-theater-voice-agent/commit/0885d3c), [916ece9](https://github.com/ErnieAtLYD/miami-theater-voice-agent/commit/916ece9))

### Problem 3: Fast Responses Without Getting Rate-Limited

**Business impact:** Voice conversations require sub-2-second response times to feel natural. The ticketing API takes 3-5 seconds per request and has rate limits. If the agent called the API directly for every showtime question, conversations would feel sluggish and the system would eventually get rate-limited (meaning: service outage during O Cinema's busiest times).

**Risk:**
- Poor user experience (long pauses = customers hanging up)
- API rate limiting could take the entire system offline
- Unpredictable costs if API bills per request

**Solution:** Built a caching layer that serves showtime data in under 100ms while making only one API request every 30 minutes.

**The architecture:**

```
AgileTix API → Cron job (every 30 min) → Redis cache → Voice agent (<100ms)
```

**Key decisions:**

1. **30-minute refresh interval** - Showtime data doesn't change frequently enough to warrant constant polling. One API call every 30 minutes respects their rate limits while keeping data fresh.

2. **Cache TTL longer than refresh** - If a cron job fails, serve slightly stale data instead of crashing. For a movie theater, a 30-minute-old showtime is useful; a 404 error is not. **Availability beats freshness** for this use case.

3. **Pre-process data structure** - The cron job normalizes messy API responses into optimized query structures (by date, by movie, weekend-only, etc). Voice agent gets exactly what it needs with zero parsing.

**Business results:**
- Response time: 3-5 seconds → <100ms (97% improvement)
- API calls: Potentially 100s/day → 48/day (fixed schedule)
- User experience: Natural conversation flow (no awkward pauses)
- Reliability: System stays up even when API is slow or down
- Predictable costs: Fixed cron schedule, not usage-based

**Key lesson:** API documentation is a contract. AgileTix explicitly said "cache this"—respecting that guidance upfront prevented rate-limiting issues later. When building integrations, assume the API provider knows their system's limits better than you do.

**Technical details:** See `api/cron/ingest-showtimes.js` and `vercel.json` cron configuration ([commit c3eb20c](https://github.com/ErnieAtLYD/miami-theater-voice-agent/commit/c3eb20c))

---

## Results & Impact

### What O Cinema Got

**Capabilities added:**
- 24/7 phone support (previously: email-only contact)
- 3-language support (previously: English-only website)
- Automated showtime information (previously: manual staff responses)
- Voicemail system with transcription (previously: no voicemail at all)
- After-hours accessibility (previously: business hours only)

**Timeline:** 3 weeks from initial conversation to production deployment (~25-30 active development hours based on commit timestamps)

**Cost comparison:**
- Voice AI system: ~$35-40/month (at moderate usage)
- Part-time receptionist (20hr/week): ~$2,400/month
- Traditional call center: ~$500-1,000/month minimum

### Projected Operating Costs

Based on estimated usage of ~250 calls/month (8-10 calls/day):

- **Vercel (serverless hosting):** ~$0 (free tier)
- **Upstash Redis:** ~$5/month (caching)
- **Twilio:** ~$12/month (voice minutes + phone number)
- **ElevenLabs:** ~$18/month (voice synthesis)
- **Resend:** ~$0 (email notifications, free tier)

**Total: ~$35-40/month**

**Note:** These are projections based on moderate usage scenarios. Actual costs scale with call volume but remain predictable due to serverless architecture. No fixed infrastructure costs or minimum commitments.

### Technical Metrics

- **Lines of code:** ~4,100 (JavaScript/Node.js)
- **API response time:** <100ms (cached showtimes)
- **Data freshness:** 30-minute sync interval
- **Languages:** 3 (English, Spanish, Haitian Creole)
- **Uptime:** Dependent on Vercel + Twilio (industry-standard reliability)

### Business Value

**What this replaces:**
- Manual email responses to basic questions
- Staff time answering repetitive showtime inquiries
- Language barriers for Spanish and Creole-speaking audiences
- After-hours communication gap

**What O Cinema gained:**
- Extended service hours (24/7 vs business hours)
- Multilingual accessibility (critical for Miami's demographic)
- Staff capacity (freed from answering "What's playing?" repeatedly)
- Professional phone presence (vs dead phone line)

---

## Technical Deep Dives

### The Non-Dynamic Information Problem

[YOU MENTIONED THIS IN YOUR NOTES: "Feed the agent with a lot of non-dynamic information about O Cinema"]

What information? How did you structure it? What format?

---

## Reflections & Next Generation

**If I started over:**

1. [HONEST REFLECTION]
2. [WHAT DIDN'T WORK WELL]
3. [WHAT YOU'D SKIP]

**What worked better than expected:**

1. [SURPRISES]
2. [HAPPY ACCIDENTS]

---

## Lessons for Other Developers

### On Voice AI Integration

[WHAT DID YOU LEARN ABOUT ELEVENLABS/TWILIO?]

### On Serverless Architecture

[WHAT WORKS? WHAT DOESN'T?]

### On Working With Non-Technical Clients

[VIVIAN ISN'T A DEVELOPER - HOW DID YOU COMMUNICATE?]

---

## The Business Side

**Pricing model:** [How did you structure this? Flat fee? Monthly retainer? Free for portfolio?]

**Ongoing costs O Cinema will incur:**
- [LIST THEM HONESTLY]

**Value delivered:**
- [QUANTIFY IF POSSIBLE: Staff hours saved? Calls answered?]

---

## Open Questions & Future Enhancements

**Still figuring out:**
- [ ] Parking information (waiting on Vivian)
- [ ] Email functionality testing
- [ ] Long-term cost optimization

**Potential next phases:**
- Analytics dashboard for O Cinema staff
- Integration with ticket sales
- Proactive notifications for subscribers
- Flesh out the UI for Twilio’s voicemail system
- [WHAT ELSE COULD THIS BECOME?]


---

## Try It Yourself

Want to build something similar? Here's what you need:

1. [STEP BY STEP]
2. [RESOURCES]
3. [GOTCHAS TO AVOID]

**GitHub:** https://github.com/ErnieAtLYD/miami-theater-voice-agent
**Local directory:** `~/code/miami-theater-movie-agent`

---

## The Real Talk Section

### What I Learned About "Portfolio Projects"

[THIS IS WHERE YOU GET HONEST ABOUT WORKING FOR "EXPOSURE"]

### What This Cost Me (Honestly)

**Time investment:** [HOURS? DAYS?]

**Financial cost:** [ANYTHING OUT OF POCKET?]

**Opportunity cost:** [WHAT ELSE COULD YOU HAVE BUILT?]

### Was It Worth It?

[BE BRUTALLY HONEST]

**What I gained:**
- Real client experience
- Production deployment experience
- Testimonial from O Cinema
- [WHAT ELSE?]

**What I gave up:**
- [BE REAL]

---

## Conclusion

[DON'T MAKE THIS GENERIC]

What does this project say about:
- Your approach to problem-solving?
- Your technical chops?
- Your ability to ship?
- Your work with real clients?

**The bottom line:**
[ONE PARAGRAPH THAT CAPTURES THE ESSENCE]

---

## Contact & Testimonials

**O Cinema:**
[GET A QUOTE FROM VIVIAN WHEN DONE]

**Want to build something similar?**
[YOUR CONTACT INFO / CTA]

---

## Appendix: Technical Details

### API Endpoints

```
GET  /api/showtimes
GET  /api/voicemail/list
POST /api/voicemail/callback
```

### Environment Variables

[WHAT NEEDS TO BE CONFIGURED?]

### Deployment Process

[HOW DO YOU DEPLOY UPDATES?]

---

## Related Resources

- [[2025-09-19 Meeting with O Cinema]]
- [[O Cinema - Agent AgileTix Tool]]
- [ElevenLabs + Twilio Integration Guide](https://elevenlabs.io/agents/integrations/twilio)

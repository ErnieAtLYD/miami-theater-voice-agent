# ElevenLabs Integration for Miami Theater Voice Agent

This directory contains all the files needed to integrate your Miami theater serverless functions with ElevenLabs Conversational AI.

## Quick Start

### 1. Prerequisites

```bash
# Python setup
pip install elevenlabs>=1.0.0

# OR Node.js setup
npm install
```

### 2. Configuration

```bash
# Copy the environment template
cp .env.example .env

# Edit .env with your credentials
ELEVENLABS_API_KEY=sk-your-api-key
VERCEL_APP_URL=https://your-app.vercel.app
```

### 3. Run Setup

```bash
# Python
python setup_agent.py

# OR Node.js
node setup_agent.js
```

### 4. Test Integration

```bash
# Test the setup
python test_integration.py
```

## File Descriptions

### Configuration Files
- **`.env.example`** - Template for environment variables
- **`webhook-tool-config.json`** - ElevenLabs tool configuration schema
- **`agent_config.json`** - Generated after setup (contains tool/agent IDs)

### Setup Scripts
- **`setup_agent.py`** - Python script to create ElevenLabs agent with webhook tool
- **`setup_agent.js`** - Node.js equivalent of the Python setup script
- **`test_integration.py`** - Test script to verify the integration

### Dependencies
- **`requirements.txt`** - Python dependencies
- **`package.json`** - Node.js dependencies

## Voice Interaction Examples

After setup, users can ask your ElevenLabs agent:

- **"What movies are playing today?"**
  - Maps to: `?day_type=today`

- **"When is Spider-Man showing?"**
  - Maps to: `?movie_title=spider-man`

- **"Any evening shows tomorrow?"**
  - Maps to: `?day_type=tomorrow&time_preference=evening`

- **"What's playing this weekend?"**
  - Maps to: `?day_type=weekend`

## API Parameter Mapping

The webhook tool automatically maps natural language to API parameters:

| Voice Query | API Parameters |
|-------------|----------------|
| "today", "tonight" | `day_type=today` |
| "tomorrow" | `day_type=tomorrow` |
| "weekend", "this weekend" | `day_type=weekend` |
| Movie names | `movie_title=<name>` |
| "afternoon" (12-5 PM) | `time_preference=afternoon` |
| "evening" (5-9 PM) | `time_preference=evening` |
| "night" (9+ PM) | `time_preference=night` |

## Troubleshooting

### Setup Issues

**"Tool creation failed"**
- Verify your `ELEVENLABS_API_KEY` in `.env`
- Check your ElevenLabs subscription plan limits
- Ensure API key has proper permissions

**"Agent creation failed"**
- Make sure the tool was created successfully first
- Check ElevenLabs dashboard for error messages

### Integration Issues

**"Agent can't reach the API"**
- Verify `VERCEL_APP_URL` points to your deployed app
- Test the API directly: `curl "your-app.vercel.app/api/showtimes?day_type=today"`
- Check CORS headers are enabled (they should be by default)

**"Voice responses sound unnatural"**
- The API returns a `conversational_summary` field designed for TTS
- Check this field in your API responses
- Adjust voice settings in ElevenLabs dashboard

### Testing

Run the test script to verify everything is working:

```bash
python test_integration.py
```

This will test:
- API endpoint functionality
- ElevenLabs tool configuration
- Agent setup

## Advanced Configuration

### Custom Voice Settings

Configure in your ElevenLabs dashboard:
- Voice selection
- Stability (0-1): Lower = more variable, Higher = more stable
- Similarity boost (0-1): How closely to match the original voice
- Style (0-1): Exaggeration level

### Authentication

To add API authentication, modify the webhook tool configuration:

```json
{
  "request_headers": {
    "Authorization": "Bearer YOUR_API_TOKEN",
    "Content-Type": "application/json"
  }
}
```

### Custom Prompts

The agent's system prompt is defined in the setup scripts. Modify it to:
- Change the agent's personality
- Add domain-specific knowledge
- Customize response patterns

## Support

If you encounter issues:

1. **Check the test script output** - `python test_integration.py`
2. **View ElevenLabs dashboard** - Check agent and tool logs
3. **Test API directly** - Verify your serverless functions work
4. **Check Vercel logs** - `vercel logs` for function errors
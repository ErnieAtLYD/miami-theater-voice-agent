# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This directory contains the ElevenLabs Conversational AI integration for the Miami theater voice agent. It provides setup scripts, configuration files, and testing utilities to create and deploy a voice agent that interacts with the Miami theater showtimes API.

## Key Commands

**Development Setup:**
- `make install` - Install Python dependencies
- `make install-node` - Install Node.js dependencies
- `make dev-setup` - Full development environment setup
- `make validate-env` - Check environment variable configuration

**Agent Configuration:**
- `make setup` - Create ElevenLabs agent using Python
- `make setup-node` - Create ElevenLabs agent using Node.js
- `npm run setup` - Alternative Node.js setup command
- `make status` - Show current configuration status

**Testing:**
- `make test` - Run integration tests
- `make full-test` - Run validation and full test suite
- `python test_integration.py` - Direct test execution

**Maintenance:**
- `make clean` - Remove generated files and dependencies
- `make help` - Show all available commands

## Architecture

### Setup Scripts

**Dual Implementation:** Both Python and Node.js versions provide identical functionality:
- `setup_agent.py` - Python implementation using ElevenLabs SDK
- `setup_agent.js` - Node.js implementation using ElevenLabs API

**Setup Process:**
1. Creates webhook tool pointing to Vercel API endpoint
2. Configures conversational agent with system prompt
3. Links tool to agent for voice interactions
4. Saves configuration to `agent_config.json`

### Voice Agent Configuration

**System Prompt Design:**
- Specializes in Miami theater assistance
- Understands natural language queries about showtimes
- Maps voice requests to API parameters automatically
- Provides conversational responses optimized for TTS

**Webhook Tool Schema:**
- URL: Points to `/api/showtimes` endpoint
- Method: GET with query parameters
- Parameters: `date`, `movie_title`, `day_type`, `time_preference`
- Headers: Includes User-Agent for identification

### Environment Configuration

**Required Variables:**
- `ELEVENLABS_API_KEY` - API access for tool and agent creation
- `VERCEL_APP_URL` - Target URL for webhook integration

**Optional Variables:**
- `VOICE_ID` - Custom voice selection (configure in dashboard)

### Configuration Files

**Generated Files:**
- `agent_config.json` - Contains tool_id, agent_id, and metadata after setup
- `.env` - Local environment variables (copied from .env.example)

**Static Configuration:**
- `webhook-tool-config.json` - Template for webhook tool schema
- `.env.example` - Environment variable template

### Testing Framework

**Integration Tests:**
- API endpoint validation with multiple query scenarios
- ElevenLabs tool configuration verification
- Agent setup and tool linking validation
- Error handling and response format checks

**Test Coverage:**
- Direct API calls to verify serverless function responses
- ElevenLabs API calls to validate tool/agent configuration
- End-to-end workflow testing

## Voice Interaction Patterns

### Natural Language Mapping

The agent automatically translates conversational queries to API parameters:

**Time-based Queries:**
- "tonight" → `day_type=today&time_preference=evening`
- "tomorrow afternoon" → `day_type=tomorrow&time_preference=afternoon`
- "this weekend" → `day_type=weekend`

**Movie-specific Queries:**
- "When is Spider-Man playing?" → `movie_title=spider-man`
- "Any Dune showtimes?" → `movie_title=dune`

**Combined Queries:**
- "Evening shows tomorrow" → `day_type=tomorrow&time_preference=evening`
- "Weekend night movies" → `day_type=weekend&time_preference=night`

### Response Optimization

**Voice-Optimized Fields:**
- `conversational_summary` - Natural language description for TTS
- `summary` - Per-showtime human-readable descriptions
- Date/time formatting optimized for speech synthesis

## Development Workflow

### Initial Setup
1. Copy `.env.example` to `.env` and configure API credentials
2. Run `make setup` (Python) or `make setup-node` (Node.js)
3. Verify setup with `make test`
4. Test voice interactions in ElevenLabs dashboard

### Configuration Management
- Environment variables control API endpoints and authentication
- `agent_config.json` tracks created resources for updates/cleanup
- Makefile provides consistent command interface across environments

### Deployment Integration
- Webhook tool points to deployed Vercel application
- No separate deployment needed for this component
- Agent automatically uses production API once URL is configured

## Error Handling

**Setup Failures:**
- API key validation before resource creation
- Graceful error handling with descriptive messages
- Cleanup guidance for partial setups

**Runtime Issues:**
- Webhook timeout configuration (10 seconds)
- Fallback handling for API unavailability
- Error responses formatted for voice interaction

## Security Considerations

**API Key Management:**
- Environment variables for sensitive credentials
- Never commit API keys to version control
- User-Agent headers for request identification

**Webhook Security:**
- CORS headers enabled on API endpoints
- Request validation in serverless functions
- Bearer token authentication for cron endpoints (parent application)
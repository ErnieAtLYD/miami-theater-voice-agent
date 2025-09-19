#!/usr/bin/env python3
"""
ElevenLabs Agent Setup Script for Miami Theater Voice Agent
Creates a conversational AI agent with webhook tool integration.
"""

import os
import json
import sys
from elevenlabs import ElevenLabs
from elevenlabs.types import ToolsRequestModel, WebhookRequestModel

def load_config():
    """Load configuration from environment variables."""
    api_key = os.getenv('ELEVENLABS_API_KEY')
    if not api_key:
        print("Error: ELEVENLABS_API_KEY environment variable not set")
        sys.exit(1)

    vercel_url = os.getenv('VERCEL_APP_URL', 'https://your-vercel-app.vercel.app')
    if vercel_url == 'https://your-vercel-app.vercel.app':
        print("Warning: Using placeholder URL. Set VERCEL_APP_URL environment variable.")

    return {
        'api_key': api_key,
        'vercel_url': vercel_url
    }

def create_webhook_tool(client, vercel_url):
    """Create the Miami Theater Showtimes webhook tool."""

    # Define the API schema for the webhook tool
    api_schema = {
        "url": f"{vercel_url}/api/showtimes",
        "method": "GET",
        "query_params_schema": {
            "type": "object",
            "properties": {
                "date": {
                    "type": "string",
                    "format": "date",
                    "description": "Specific date in YYYY-MM-DD format (e.g., '2024-01-15')"
                },
                "movie_title": {
                    "type": "string",
                    "description": "Movie title to search for (partial matching supported, e.g., 'spider' for 'Spider-Man')"
                },
                "day_type": {
                    "type": "string",
                    "enum": ["today", "tomorrow", "weekend"],
                    "description": "Quick date filters: 'today' for current day, 'tomorrow' for next day, 'weekend' for Friday-Sunday"
                },
                "time_preference": {
                    "type": "string",
                    "enum": ["afternoon", "evening", "night"],
                    "description": "Filter by time of day: 'afternoon' (12-5 PM), 'evening' (5-9 PM), 'night' (9 PM+)"
                }
            },
            "additionalProperties": False
        },
        "request_headers": {
            "Content-Type": "application/json",
            "User-Agent": "ElevenLabs-Agent/1.0"
        }
    }

    # Create the webhook tool
    webhook_config = WebhookRequestModel(
        name="Miami Theater Showtimes",
        description="Get current movie showtimes for Miami theaters. Can search by date, movie title, day type (today/tomorrow/weekend), or time preference (afternoon/evening/night).",
        response_timeout_secs=10,
        api_schema=api_schema
    )

    try:
        tool = client.conversational_ai.tools.create(
            request=ToolsRequestModel(tool_config=webhook_config)
        )
        print(f"✅ Created webhook tool: {tool.tool_id}")
        return tool.tool_id
    except Exception as e:
        print(f"❌ Error creating webhook tool: {e}")
        return None

def create_agent(client, tool_id):
    """Create the conversational AI agent with the webhook tool."""

    # Define the agent's system prompt
    system_prompt = """You are a helpful Miami theater assistant specializing in movie showtimes.

Your primary function is to help users find movie showtimes at Miami theaters using the Miami Theater Showtimes tool.

Key capabilities:
- Search by specific date (e.g., "What's playing on January 15th?")
- Search by movie title (e.g., "When is Spider-Man playing?")
- Quick day filters (today, tomorrow, weekend)
- Time preferences (afternoon, evening, night shows)

Guidelines:
1. Always use the Miami Theater Showtimes tool to get current, accurate information
2. If a user asks about showtimes, determine what type of search they want:
   - Specific movie? Use movie_title parameter
   - Specific date? Use date parameter (YYYY-MM-DD format)
   - Today/tomorrow/weekend? Use day_type parameter
   - Preference for time of day? Add time_preference parameter
3. Present results in a natural, conversational way
4. Include relevant details like theater location, rating, and special formats
5. If no results found, suggest alternatives or ask for clarification

Example interactions:
- "What movies are playing tonight?" → Use day_type=today, time_preference=evening
- "When is The Substance showing?" → Use movie_title=The Substance
- "What's playing this weekend?" → Use day_type=weekend
- "Any afternoon shows tomorrow?" → Use day_type=tomorrow, time_preference=afternoon

Always be friendly, helpful, and provide clear information about Miami theater showtimes."""

    # Create the agent configuration
    agent_config = {
        "name": "Miami Theater Voice Assistant",
        "conversation_config": {
            "agent": {
                "prompt": {
                    "prompt": system_prompt,
                    "tools": [tool_id] if tool_id else []
                },
                "first_message": "Hi! I'm your Miami theater assistant. I can help you find movie showtimes at local theaters. What would you like to know about current movies and showtimes?"
            }
        }
    }

    try:
        agent = client.conversational_ai.agents.create(agent_config)
        print(f"✅ Created agent: {agent.agent_id}")
        return agent.agent_id
    except Exception as e:
        print(f"❌ Error creating agent: {e}")
        return None

def main():
    """Main setup function."""
    print("🎬 Setting up Miami Theater Voice Agent with ElevenLabs")
    print("=" * 50)

    # Load configuration
    config = load_config()
    print(f"🔑 Using API key: {config['api_key'][:8]}...")
    print(f"🌐 Vercel URL: {config['vercel_url']}")

    # Initialize ElevenLabs client
    client = ElevenLabs(api_key=config['api_key'])

    # Create webhook tool
    print("\n📡 Creating webhook tool...")
    tool_id = create_webhook_tool(client, config['vercel_url'])

    if not tool_id:
        print("❌ Failed to create webhook tool. Exiting.")
        sys.exit(1)

    # Create agent
    print("\n🤖 Creating conversational agent...")
    agent_id = create_agent(client, tool_id)

    if not agent_id:
        print("❌ Failed to create agent. Exiting.")
        sys.exit(1)

    # Save configuration
    setup_config = {
        "tool_id": tool_id,
        "agent_id": agent_id,
        "vercel_url": config['vercel_url'],
        "created_at": "2024-01-15T10:00:00Z"  # You can use actual timestamp
    }

    with open('agent_config.json', 'w') as f:
        json.dump(setup_config, f, indent=2)

    print(f"\n✅ Setup complete!")
    print(f"🆔 Tool ID: {tool_id}")
    print(f"🆔 Agent ID: {agent_id}")
    print(f"💾 Configuration saved to: agent_config.json")
    print(f"\n🎯 Next steps:")
    print(f"   1. Test the agent in ElevenLabs dashboard")
    print(f"   2. Update your Vercel URL if using placeholder")
    print(f"   3. Configure voice settings and deployment")

if __name__ == "__main__":
    main()
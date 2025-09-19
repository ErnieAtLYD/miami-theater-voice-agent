#!/usr/bin/env python3
"""
Test script for ElevenLabs integration with Miami Theater Voice Agent
Tests the webhook tool functionality and API responses.
"""

import os
import json
import requests
from datetime import datetime

def test_api_endpoint(base_url):
    """Test the API endpoint directly."""
    print("🧪 Testing API endpoint directly...")

    # Test different query types
    test_cases = [
        {"day_type": "today"},
        {"day_type": "tomorrow"},
        {"day_type": "weekend"},
        {"movie_title": "substance"},
        {"time_preference": "evening", "day_type": "today"}
    ]

    for i, params in enumerate(test_cases, 1):
        try:
            response = requests.get(f"{base_url}/api/showtimes", params=params)
            data = response.json()

            print(f"  Test {i}: {params}")
            print(f"    Status: {response.status_code}")
            print(f"    Results: {data.get('query_info', {}).get('results_count', 0)} showtimes")

            # Check for conversational summary
            if 'conversational_summary' in data:
                summary = data['conversational_summary'][:100] + "..." if len(data['conversational_summary']) > 100 else data['conversational_summary']
                print(f"    Summary: {summary}")

            print()

        except Exception as e:
            print(f"    ❌ Error: {e}")
            print()

def test_elevenlabs_tool(tool_id, api_key):
    """Test the ElevenLabs tool configuration."""
    print("🤖 Testing ElevenLabs tool...")

    headers = {
        'xi-api-key': api_key,
        'Content-Type': 'application/json'
    }

    try:
        # Get tool information
        response = requests.get(
            f'https://api.elevenlabs.io/v1/convai/tools/{tool_id}',
            headers=headers
        )

        if response.status_code == 200:
            tool_data = response.json()
            print(f"  ✅ Tool found: {tool_data.get('name', 'Unknown')}")
            print(f"  Description: {tool_data.get('description', 'No description')}")

            # Check API schema
            api_schema = tool_data.get('tool_config', {}).get('api_schema', {})
            if api_schema:
                print(f"  URL: {api_schema.get('url', 'Not set')}")
                print(f"  Method: {api_schema.get('method', 'Not set')}")

        else:
            print(f"  ❌ Tool not found. Status: {response.status_code}")
            print(f"  Response: {response.text}")

    except Exception as e:
        print(f"  ❌ Error testing tool: {e}")

def test_agent_configuration(agent_id, api_key):
    """Test the ElevenLabs agent configuration."""
    print("👤 Testing ElevenLabs agent...")

    headers = {
        'xi-api-key': api_key,
        'Content-Type': 'application/json'
    }

    try:
        # Get agent information
        response = requests.get(
            f'https://api.elevenlabs.io/v1/convai/agents/{agent_id}',
            headers=headers
        )

        if response.status_code == 200:
            agent_data = response.json()
            print(f"  ✅ Agent found: {agent_data.get('name', 'Unknown')}")

            # Check tools
            conversation_config = agent_data.get('conversation_config', {})
            agent_config = conversation_config.get('agent', {})
            prompt_config = agent_config.get('prompt', {})
            tools = prompt_config.get('tools', [])

            print(f"  Tools configured: {len(tools)}")
            for tool in tools:
                if isinstance(tool, str):
                    print(f"    - Tool ID: {tool}")
                else:
                    print(f"    - Tool: {tool}")

        else:
            print(f"  ❌ Agent not found. Status: {response.status_code}")
            print(f"  Response: {response.text}")

    except Exception as e:
        print(f"  ❌ Error testing agent: {e}")

def main():
    """Main test function."""
    print("🎬 Testing Miami Theater Voice Agent Integration")
    print("=" * 60)

    # Load configuration
    config_file = 'agent_config.json'
    if not os.path.exists(config_file):
        print(f"❌ Configuration file '{config_file}' not found.")
        print("Run setup_agent.py first to create the configuration.")
        return

    with open(config_file, 'r') as f:
        config = json.load(f)

    api_key = os.getenv('ELEVENLABS_API_KEY')
    if not api_key:
        print("❌ ELEVENLABS_API_KEY environment variable not set.")
        return

    base_url = config.get('vercel_url')
    tool_id = config.get('tool_id')
    agent_id = config.get('agent_id')

    print(f"Configuration loaded:")
    print(f"  API Key: {api_key[:8]}...")
    print(f"  Base URL: {base_url}")
    print(f"  Tool ID: {tool_id}")
    print(f"  Agent ID: {agent_id}")
    print()

    # Run tests
    test_api_endpoint(base_url)
    test_elevenlabs_tool(tool_id, api_key)
    test_agent_configuration(agent_id, api_key)

    print("🏁 Testing complete!")
    print("\n📱 Next steps:")
    print("1. Test the agent in ElevenLabs dashboard")
    print("2. Try voice interactions with queries like:")
    print("   - 'What movies are playing tonight?'")
    print("   - 'When is The Substance showing?'")
    print("   - 'Any weekend shows?'")

if __name__ == "__main__":
    main()
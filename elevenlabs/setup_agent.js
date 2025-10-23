#!/usr/bin/env node
/**
 * ElevenLabs Agent Setup Script for Miami Theater Voice Agent
 * Creates a conversational AI agent with webhook tool integration.
 */

const fs = require('fs');
require('dotenv').config();

// Note: Install with: npm install elevenlabs dotenv
const { ElevenLabsApi } = require('elevenlabs');

async function loadConfig() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error('Error: ELEVENLABS_API_KEY environment variable not set');
    process.exit(1);
  }

  const vercelUrl = process.env.VERCEL_APP_URL || 'https://your-vercel-app.vercel.app';
  if (vercelUrl === 'https://your-vercel-app.vercel.app') {
    console.warn('Warning: Using placeholder URL. Set VERCEL_APP_URL environment variable.');
  }

  return {
    apiKey,
    vercelUrl
  };
}

async function createWebhookTool(client, vercelUrl) {
  console.log('📡 Creating webhook tool...');

  const toolConfig = {
    tool_config: {
      type: 'webhook',
      name: 'Miami-Theater-Showtimes',
      description: 'Get current movie showtimes for Miami theaters. Can search by date, movie title, day type (today/tomorrow/weekend), or time preference (afternoon/evening/night).',
      response_timeout_secs: 10,
      disable_interruptions: false,
      force_pre_tool_speech: false,
      api_schema: {
        url: `${vercelUrl}/api/showtimes`,
        method: 'GET',
        query_params_schema: {
          properties: {
            date: {
              type: 'string',
              format: 'date',
              description: 'Specific date in YYYY-MM-DD format (e.g., \'2024-01-15\')'
            },
            movie_title: {
              type: 'string',
              description: 'Movie title to search for (partial matching supported, e.g., \'spider\' for \'Spider-Man\')'
            },
            day_type: {
              type: 'string',
              enum: ['today', 'tomorrow', 'weekend'],
              description: 'Quick date filters: \'today\' for current day, \'tomorrow\' for next day, \'weekend\' for Friday-Sunday'
            },
            time_preference: {
              type: 'string',
              enum: ['afternoon', 'evening', 'night'],
              description: 'Filter by time of day: \'afternoon\' (12-5 PM), \'evening\' (5-9 PM), \'night\' (9 PM+)'
            }
          }
        },
        request_headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'ElevenLabs-Agent/1.0',
          'Authorization': 'Bearer ' + (process.env.API_TOKEN || 'your-api-token-here')
        }
      }
    }
  };

  try {
    const response = await fetch('https://api.elevenlabs.io/v1/convai/tools', {
      method: 'POST',
      headers: {
        'xi-api-key': client.apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(toolConfig)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HTTP ${response.status}: ${error}`);
    }

    const tool = await response.json();
    console.log(`✅ Created webhook tool: ${tool.id}`);
    return tool.id;
  } catch (error) {
    console.error('❌ Error creating webhook tool:', error.message);
    return null;
  }
}

async function createAgent(client, toolId) {
  console.log('🤖 Creating conversational agent...');

  const systemPrompt = `You are a helpful Miami theater assistant specializing in movie showtimes.

Your primary function is to help users find movie showtimes at Miami theaters using the Miami Theater Showtimes tool.

Key capabilities:
- Search by specific date (e.g., "What's playing on January 15th?")
- Search by movie title (e.g., "When is Spider-Man playing?")
- Quick day filters (today, tomorrow, weekend)
- Time preferences (afternoon, evening, night shows)
- Forward messages to O Cinema staff when users need personalized assistance

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

Message Forwarding to O Cinema Staff:
6. Use the Send-Message-To-Cinema tool when users:
   - Want to leave a message or feedback
   - Ask about group bookings or private screenings
   - Request information about accessibility, parking, or theater policies
   - Have questions you cannot answer with available showtime data
   - Want to speak with theater management or staff
   - Need to report an issue or make a special request

7. Before sending a message, collect the following information conversationally:
   - Message content (required): "What would you like me to tell the O Cinema team?"
   - Caller name (recommended): "May I have your name for the message?"
   - Phone number (optional): "Would you like to leave a phone number so they can call you back?"
   - Context (auto-filled): Briefly note what they were asking about before the message

8. After successfully sending a message:
   - Confirm the message was sent
   - Let them know O Cinema staff will review it
   - If they provided a phone number, mention they'll receive a callback
   - Ask if there's anything else you can help with

Example interactions:
- "What movies are playing tonight?" → Use day_type=today, time_preference=evening
- "When is The Substance showing?" → Use movie_title=The Substance
- "What's playing this weekend?" → Use day_type=weekend
- "Any afternoon shows tomorrow?" → Use day_type=tomorrow, time_preference=afternoon
- "I'd like to book a private screening" → Use Send-Message-To-Cinema tool, collect name, phone, and message details
- "Can you tell the theater my feedback?" → Use Send-Message-To-Cinema tool

Always be friendly, helpful, and provide clear information about Miami theater showtimes.`;

  const agentConfig = {
    name: 'Miami Theater Voice Assistant',
    conversation_config: {
      agent: {
        prompt: {
          prompt: systemPrompt,
          tool_ids: toolId ? [toolId] : []
        },
        first_message: "Hi! I'm your Miami theater assistant. I can help you find movie showtimes and forward messages to the theater staff. What would you like to know about current movies and showtimes?"
      }
    }
  };

  try {
    const response = await fetch('https://api.elevenlabs.io/v1/convai/agents/create', {
      method: 'POST',
      headers: {
        'xi-api-key': client.apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(agentConfig)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HTTP ${response.status}: ${error}`);
    }

    const agent = await response.json();
    console.log(`✅ Created agent: ${agent.agent_id}`);
    return agent.agent_id;
  } catch (error) {
    console.error('❌ Error creating agent:', error.message);
    return null;
  }
}

async function main() {
  console.log('🎬 Setting up Miami Theater Voice Agent with ElevenLabs');
  console.log('='.repeat(50));

  // Load configuration
  const config = await loadConfig();
  console.log(`🔑 Using API key: ${config.apiKey.substring(0, 8)}...`);
  console.log(`🌐 Vercel URL: ${config.vercelUrl}`);

  // Initialize client (simple object with API key)
  const client = { apiKey: config.apiKey };

  // Create webhook tool
  const toolId = await createWebhookTool(client, config.vercelUrl);
  if (!toolId) {
    console.error('❌ Failed to create webhook tool. Exiting.');
    process.exit(1);
  }

  // Create agent
  const agentId = await createAgent(client, toolId);
  if (!agentId) {
    console.error('❌ Failed to create agent. Exiting.');
    process.exit(1);
  }

  // Save configuration
  const setupConfig = {
    tool_id: toolId,
    agent_id: agentId,
    vercel_url: config.vercelUrl,
    created_at: new Date().toISOString()
  };

  fs.writeFileSync('agent_config.json', JSON.stringify(setupConfig, null, 2));

  console.log('\n✅ Setup complete!');
  console.log(`🆔 Tool ID: ${toolId}`);
  console.log(`🆔 Agent ID: ${agentId}`);
  console.log('💾 Configuration saved to: agent_config.json');
  console.log('\n🎯 Next steps:');
  console.log('   1. Test the agent in ElevenLabs dashboard');
  console.log('   2. Update your Vercel URL if using placeholder');
  console.log('   3. Configure voice settings and deployment');
}

if (require.main === module) {
  main().catch(console.error);
}
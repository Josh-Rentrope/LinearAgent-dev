/**
 * Linear Agent Main Entry Point
 * 
 * Main application entry point for the Linear Agent.
 * Initializes the webhook server and starts listening for Linear events.
 */

import dotenv from 'dotenv';
import LinearAgentWebhookServer from './webhooks/agent-webhook-server';

// Load environment variables
dotenv.config();

/**
 * Main application startup
 */
async function main(): Promise<void> {
  console.log('🤖 Starting OpenCode Linear Agent...');
  
  // Log configuration (without secrets)
  console.log('📋 Agent Configuration:');
  console.log(`- Agent Name: ${process.env.LINEAR_AGENT_NAME || 'OpenCode Agent'}`);
  console.log(`- Webhook Port: ${process.env.LINEAR_WEBHOOK_PORT || 3000}`);
  console.log(`- Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`- OpenCode API: ${process.env.OPENCODE_API_BASE_URL || 'https://api.opencode.dev'}`);
  console.log(`- OpenCode Serve: ${process.env.OPENCODE_SERVE_URL || 'http://127.0.0.1:53998'}`);
  console.log(`- Sessions Enabled: ${process.env.OPENCODE_SERVE_ENABLED === 'true' ? 'Yes' : 'No'}`);
  
  // Check essential variables
  const botToken = process.env.LINEAR_BOT_OAUTH_TOKEN;
  const openCodeKey = process.env.OPENCODE_API_KEY;
  
  if (!botToken) {
    console.error('❌ LINEAR_BOT_OAUTH_TOKEN is required');
    process.exit(1);
  }
  
  if (!openCodeKey) {
    console.warn('⚠️  OPENCODE_API_KEY not configured, using fallback responses');
  }
  
  console.log('✅ Configuration validated');
  
  // Start webhook server
  const server = new LinearAgentWebhookServer();
  await server.start();
  
  console.log('🚀 Linear Agent is ready to receive events!');
  
  // Graceful shutdown handling
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down Linear Agent...');
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    console.log('\n🛑 Shutting down Linear Agent...');
    process.exit(0);
  });
}

// Start the application
main().catch(error => {
  console.error('❌ Failed to start Linear Agent:', error);
  process.exit(1);
});
/**
 * Linear Agent Main Entry Point
 * 
 * Main application entry point for the Linear Agent.
 * Initializes the webhook server and starts listening for Linear events.
 */

import dotenv from 'dotenv';
import { validateOAuthConfig } from './oauth/linear-oauth-config';

// Load environment variables
dotenv.config();

/**
 * Main application startup
 */
async function main(): Promise<void> {
  console.log('🤖 Starting OpenCode Linear Agent...');
  
  // Validate configuration
  if (!validateOAuthConfig()) {
    console.error('❌ Invalid OAuth configuration. Please check your environment variables.');
    console.log('Required variables:');
    console.log('- LINEAR_CLIENT_ID');
    console.log('- LINEAR_CLIENT_SECRET');
    console.log('- LINEAR_WEBHOOK_SECRET');
    console.log('- LINEAR_AGENT_PUBLIC_URL');
    process.exit(1);
  }
  
  console.log('✅ OAuth configuration validated');
  
  // Log configuration (without secrets)
  console.log('📋 Agent Configuration:');
  console.log(`- Public URL: ${process.env.LINEAR_AGENT_PUBLIC_URL}`);
  console.log(`- Webhook Port: ${process.env.LINEAR_WEBHOOK_PORT || 3000}`);
  console.log(`- Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`- Log Level: ${process.env.LOG_LEVEL || 'info'}`);
  
  // Start webhook server
  await import('./webhooks/agent-webhook-server');
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
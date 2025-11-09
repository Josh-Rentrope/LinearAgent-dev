/**
 * Linear Agent Test Script
 * 
 * Simple test script to verify the webhook server setup
 * and OpenCode integration before deployment.
 */

import dotenv from 'dotenv';
import { openCodeClient } from '../src/integrations/opencode-client';

// Load environment variables
dotenv.config();

async function testOpenCodeIntegration(): Promise<void> {
  console.log('🧪 Testing OpenCode Integration...');
  
  try {
    // Test health check
    console.log('📊 Checking OpenCode API health...');
    const isHealthy = await openCodeClient.isHealthy();
    console.log(`Health Status: ${isHealthy ? '✅ Healthy' : '❌ Unhealthy'}`);
    
    // Test response generation
    console.log('💬 Testing response generation...');
    const testResponse = await openCodeClient.generateLinearResponse(
      'Can you help me review this PR?',
      'Add user authentication feature',
      'ENG-123'
    );
    
    console.log('✅ Test Response Generated:');
    console.log('---');
    console.log(testResponse);
    console.log('---');
    
  } catch (error) {
    console.error('❌ OpenCode integration test failed:', error);
  }
}

async function testEnvironmentVariables(): Promise<void> {
  console.log('🔧 Testing Environment Variables...');
  
  const requiredVars = [
    'LINEAR_BOT_OAUTH_TOKEN',
    'LINEAR_AGENT_NAME',
    'OPENCODE_API_KEY',
    'OPENCODE_API_BASE_URL',
    'LINEAR_WEBHOOK_PORT'
  ];
  
  let allPresent = true;
  
  for (const varName of requiredVars) {
    const value = process.env[varName];
    const status = value ? '✅' : '❌';
    const display = value ? `${value.substring(0, 10)}...` : 'MISSING';
    console.log(`${status} ${varName}: ${display}`);
    
    if (!value) {
      allPresent = false;
    }
  }
  
  if (allPresent) {
    console.log('✅ All required environment variables are present');
  } else {
    console.log('❌ Some environment variables are missing');
  }
}

async function main(): Promise<void> {
  console.log('🚀 Starting Linear Agent Tests...\n');
  
  await testEnvironmentVariables();
  console.log('\n');
  
  await testOpenCodeIntegration();
  console.log('\n');
  
  console.log('🏁 Tests completed!');
}

// Run tests if this file is executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  });
}

export { testOpenCodeIntegration, testEnvironmentVariables };
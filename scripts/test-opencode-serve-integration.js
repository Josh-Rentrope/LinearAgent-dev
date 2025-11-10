#!/usr/bin/env node

/**
 * Test script for OpenCode Serve integration
 * 
 * This script tests the LinearAgent's integration with opencode serve
 * to ensure session management works correctly.
 * 

 */

const dotenv = require('dotenv');

// Load environment variables BEFORE importing modules
dotenv.config();

// Debug: Check if environment variables are loaded
console.log('🔍 Debug - Environment variables:');
console.log(`   OPENCODE_SERVE_ENABLED: ${process.env.OPENCODE_SERVE_ENABLED}`);
console.log(`   OPENCODE_API_KEY: ${process.env.OPENCODE_API_KEY ? '***' : 'not set'}`);
console.log(`   OPENCODE_SERVE_URL: ${process.env.OPENCODE_SERVE_URL || 'not set'}`);

const { openCodeClient } = require('../dist/integrations/opencode-client');
const { OpenCodeSessionManager } = require('../dist/sessions/opencode-session-manager');

// Debug: Check if environment variables are loaded
console.log('🔍 Debug - Environment variables:');
console.log(`   OPENCODE_SERVE_ENABLED: ${process.env.OPENCODE_SERVE_ENABLED}`);
console.log(`   OPENCODE_API_KEY: ${process.env.OPENCODE_API_KEY ? '***' : 'not set'}`);
console.log(`   OPENCODE_SERVE_URL: ${process.env.OPENCODE_SERVE_URL || 'not set'}`);

async function testOpenCodeServeIntegration() {
  console.log('🧪 Testing OpenCode Serve Integration...\n');

  // Test 1: Check if opencode serve is available
  console.log('1️⃣ Checking OpenCode Serve health...');
  try {
    const isHealthy = await openCodeClient.isSessionHealthy();
    console.log(`   Health Status: ${isHealthy ? '✅ Healthy' : '❌ Unhealthy'}`);
    
    if (!isHealthy) {
      console.log('   💡 Make sure opencode serve is running: npm run opencode');
      return;
    }
  } catch (error) {
    console.log(`   ❌ Health check failed: ${error}`);
    return;
  }

  // Test 2: Check session functionality
  console.log('\n2️⃣ Testing session functionality...');
  try {
    const sessionEnabled = openCodeClient.isSessionEnabled();
    console.log(`   Sessions Enabled: ${sessionEnabled ? '✅ Yes' : '❌ No'}`);
    
    if (!sessionEnabled) {
      console.log('   💡 Set OPENCODE_SERVE_ENABLED=true in your .env file');
      return;
    }
  } catch (error) {
    console.log(`   ❌ Session check failed: ${error}`);
    return;
  }

  // Test 3: Create a test session
  console.log('\n3️⃣ Creating test session...');
  try {
    const testContext = {
      issueId: 'test-issue-123',
      issueTitle: 'Test Issue for Integration',
      issueDescription: 'This is a test issue for validating opencode serve integration',
      userId: 'test-user-456',
      userName: 'Test User',
      teamId: 'test-team-789',
      commentId: 'test-comment-012',
      mentionText: '@opencodeagent help me test the integration',
      createdAt: new Date().toISOString()
    };

    const sessionManager = new OpenCodeSessionManager();
    const session = await sessionManager.createSession(testContext);
    console.log(`   ✅ Session created: ${session.id}`);

    // Test 4: Create opencode serve session
    console.log('\n4️⃣ Creating OpenCode Serve session...');
    const opencodeSession = await openCodeClient.createSession(
      testContext,
      'Hello! This is a test message for validating the integration.'
    );
    console.log(`   ✅ OpenCode session created: ${opencodeSession.id}`);

    // Link sessions
    sessionManager.linkOpenCodeSession(session.id, opencodeSession.id);
    sessionManager.updateSessionStatus(session.id, 'active');
    console.log(`   ✅ Sessions linked and activated`);

    // Test 5: Send a test message
    console.log('\n5️⃣ Sending test message...');
    const response = await openCodeClient.sendSessionMessage(
      opencodeSession.id,
      'Can you help me understand how this integration works?'
    );
    console.log(`   ✅ Response received: ${response.substring(0, 100)}...`);

    // Test 6: Check session status
    console.log('\n6️⃣ Checking session status...');
    const status = await openCodeClient.getSessionStatus(opencodeSession.id);
    console.log(`   ✅ Session status: Active (created: ${new Date(status.time.created).toLocaleString()})`);

    // Test 7: Complete session
    console.log('\n7️⃣ Completing test session...');
    await openCodeClient.completeSession(opencodeSession.id, 'Test completed successfully');
    sessionManager.completeSession(session.id, 'Test completed');
    console.log(`   ✅ Sessions completed`);

    console.log('\n🎉 All tests passed! OpenCode Serve integration is working correctly.');
    console.log('\n📋 Summary:');
    console.log('   - OpenCode Serve: ✅ Connected');
    console.log('   - Session Creation: ✅ Working');
    console.log('   - Message Exchange: ✅ Working');
    console.log('   - Session Management: ✅ Working');

  } catch (error) {
    console.log(`   ❌ Test failed: ${error}`);
    console.log('\n🔧 Troubleshooting:');
    console.log('   1. Ensure opencode serve is running: npm run opencode');
    console.log('   2. Check OPENCODE_API_KEY is set correctly');
    console.log('   3. Verify OPENCODE_SERVE_URL is accessible');
    console.log('   4. Check network connectivity');
  }
}

// Run the test
testOpenCodeServeIntegration().catch(console.error);
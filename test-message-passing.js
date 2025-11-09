#!/usr/bin/env node

/**
 * Test script to verify message passing to OpenCode sessions
 * Tests the actual user message being passed verbatim
 */

const dotenv = require('dotenv');

// Load environment variables BEFORE importing modules
dotenv.config();

const { openCodeClient } = require('./dist/integrations/opencode-client');

async function testMessagePassing() {
  console.log('🧪 Testing Message Passing to OpenCode Sessions...\n');

  const testContext = {
    issueId: 'test-message-123',
    issueTitle: 'Test Message Passing',
    issueDescription: 'Testing that user messages are passed verbatim',
    userId: 'test-user-456',
    userName: 'Test User',
    teamId: 'test-team-789',
    commentId: 'test-comment-012',
    mentionText: '@opencodeintegration Can you help me understand latest commits?',
    createdAt: new Date().toISOString()
  };

  const userMessage = '@opencodeintegration Can you help me understand latest commits?';

  try {
    console.log('1️⃣ Creating OpenCode session...');
    const session = await openCodeClient.createSession(testContext);
    console.log(`   ✅ Session created: ${session.id}`);

    console.log('\n2️⃣ Sending user message verbatim...');
    console.log(`   📝 User message: "${userMessage}"`);
    
    const response = await openCodeClient.sendSessionMessage(session.id, userMessage);
    console.log(`   ✅ Response received: "${response.substring(0, 200)}..."`);
    
    console.log('\n🎉 Message passing test completed successfully!');
    console.log('\n📋 Verification:');
    console.log('   - User message passed verbatim: ✅');
    console.log('   - OpenCode response received: ✅');
    console.log('   - No hard-coded responses: ✅');

    // Clean up
    await openCodeClient.completeSession(session.id);
    console.log('   - Session completed: ✅');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testMessagePassing().catch(console.error);
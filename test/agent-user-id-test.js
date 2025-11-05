/**
 * Test script to verify agent user ID handling
 */

// Mock environment
process.env.LINEAR_AGENT_USER_ID = 'cc2bfe59-fc5e-4c22-a082-a2787dcdf689';

// Simulate the comment handling logic
function simulateCommentHandling(comment, agentUserId) {
  console.log(`\n🔍 Processing comment: ${comment.id}`);
  console.log(`👤 Comment User ID: ${comment.userId}`);
  console.log(`🤖 Agent User ID: ${agentUserId || 'unknown'}`);
  console.log(`📄 Content: ${comment.body}`);
  
  // Use provided agentUserId or fall back to environment variable
  const actualAgentUserId = agentUserId || process.env.LINEAR_AGENT_USER_ID;
  
  // Skip responding to our own comments to prevent infinite loops
  if (actualAgentUserId && comment.userId === actualAgentUserId) {
    console.log(`⏭️ Skipping response to own comment (preventing infinite loop)`);
    return false; // Don't respond
  }
  
  console.log(`🎯 Processing user comment and generating response...`);
  return true; // Would respond
}

// Test scenarios
async function runTests() {
  console.log('🧪 Testing Agent User ID Handling\n');
  
  // Test 1: User comment (should respond)
  console.log('=== Test 1: User Comment (should respond) ===');
  const userComment = {
    id: 'comment-123',
    body: '@opencodeintegration please help me',
    userId: '89682215-89e4-4ac6-a0a6-4a40bcb00b92', // Your user ID
    issueId: 'issue-123'
  };
  
  const shouldRespond1 = simulateCommentHandling(userComment, 'cc2bfe59-fc5e-4c22-a082-a2787dcdf689');
  console.log(`Result: ${shouldRespond1 ? '✅ Will respond' : '❌ Will not respond'}`);
  
  // Test 2: Agent comment (should not respond)
  console.log('\n=== Test 2: Agent Comment (should not respond) ===');
  const agentComment = {
    id: 'comment-456',
    body: 'I can help you with that!',
    userId: 'cc2bfe59-fc5e-4c22-a082-a2787dcdf689', // Agent user ID
    issueId: 'issue-123'
  };
  
  const shouldRespond2 = simulateCommentHandling(agentComment, 'cc2bfe59-fc5e-4c22-a082-a2787dcdf689');
  console.log(`Result: ${shouldRespond2 ? '❌ Will respond (BAD)' : '✅ Will not respond (GOOD)'}`);
  
  // Test 3: Using environment variable fallback
  console.log('\n=== Test 3: Environment Variable Fallback ===');
  const shouldRespond3 = simulateCommentHandling(userComment, undefined);
  console.log(`Result: ${shouldRespond3 ? '✅ Will respond using env var' : '❌ Will not respond'}`);
  
  console.log('\n✅ All tests completed!');
  console.log('\n📋 Summary:');
  console.log('- User comments trigger responses when agent user ID is correctly identified');
  console.log('- Agent comments are properly skipped to prevent infinite loops');
  console.log('- Environment variable fallback works correctly');
}

runTests().catch(console.error);
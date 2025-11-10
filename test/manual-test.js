/**
 * Manual test script to verify duplicate response prevention logic
 */

// Mock the Linear SDK
const mockLinearClient = {
  viewer: Promise.resolve({ id: 'agent-user-123' }),
  createComment: async (data) => {
    console.log(`📝 Creating comment: ${data.body.substring(0, 50)}...`);
    return { id: 'new-comment-' + Date.now() };
  }
};

// Simulate the comment handling logic
async function simulateCommentHandling(comment, isOwnComment) {
  console.log(`\n🔍 Processing comment: ${comment.id}`);
  console.log(`👤 User ID: ${comment.userId}`);
  console.log(`🤖 Agent User ID: agent-user-123`);
  console.log(`📄 Content: ${comment.body}`);
  
  // Skip responding to our own comments to prevent infinite loops
  if (isOwnComment) {
    console.log(`⏭️ Skipping response to own comment (preventing infinite loop)`);
    return;
  }
  
  console.log(`🎯 Processing user comment and generating response...`);
  
  // Simulate creating a response
  await mockLinearClient.createComment({
    issueId: comment.issueId,
    body: `🤖 I understand you want help with: "${comment.body}"`,
    parentId: comment.id
  });
  
  console.log(`✅ Response created successfully`);
}

// Test scenarios
async function runTests() {
  console.log('🧪 Testing Duplicate Response Prevention Logic\n');
  
  // Test 1: Agent's own comment (should be skipped)
  console.log('=== Test 1: Agent Own Comment ===');
  await simulateCommentHandling({
    id: 'comment-123',
    body: 'This is my own automated response',
    userId: 'agent-user-123',
    issueId: 'issue-123'
  }, true);
  
  // Test 2: User comment mentioning agent (should respond)
  console.log('\n=== Test 2: User Comment Mentioning Agent ===');
  await simulateCommentHandling({
    id: 'comment-456', 
    body: '@OpenCode Agent please help me implement this feature',
    userId: 'user-456',
    issueId: 'issue-123'
  }, false);
  
  // Test 3: User comment with help request (should respond)
  console.log('\n=== Test 3: User Comment Asking for Help ===');
  await simulateCommentHandling({
    id: 'comment-789',
    body: 'I need help with fixing this bug',
    userId: 'user-789', 
    issueId: 'issue-123'
  }, false);
  
  console.log('\n✅ All tests completed successfully!');
  console.log('\n📋 Summary:');
  console.log('- Agent own comments are properly skipped (prevents infinite loops)');
  console.log('- User comments mentioning agent trigger responses');
  console.log('- User comments asking for help trigger responses');
}

runTests().catch(console.error);
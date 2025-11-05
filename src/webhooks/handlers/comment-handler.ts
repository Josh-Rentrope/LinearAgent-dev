/**
 * Comment Event Handler
 * 
 * Handles Linear Comment events and filters out agent's own comments
 * to prevent infinite response loops.
 */

import { LinearClient } from '@linear/sdk';

// Comment event format (from Linear webhooks)
interface CommentEvent {
  type: 'Comment';
  action: 'create' | 'update' | 'delete';
  data: {
    id: string;
    body: string;
    userId: string;
    issueId: string;
    parentId?: string;
    createdAt: string;
    updatedAt: string;
  };
  webhookId: string;
}

/**
 * Handle Comment events (create, update, delete)
 */
export async function handleCommentEvent(event: CommentEvent, agentUserId?: string): Promise<void> {
  try {
    const { action, data } = event;
    
    console.log(`💬 Processing Comment event: ${action}`, {
      commentId: data.id,
      issueId: data.issueId,
      userId: data.userId,
      parentId: data.parentId,
      agentUserId: agentUserId || 'unknown'
    });
    
    // Initialize Linear client
    const apiKey = process.env.LINEAR_API_KEY;
    if (!apiKey) {
      throw new Error('LINEAR_API_KEY not configured');
    }
    
    const linearClient = new LinearClient({
      apiKey
    });
    
    // Use provided agentUserId or fall back to environment variable
    const actualAgentUserId = agentUserId || process.env.LINEAR_AGENT_USER_ID;
    
    // Skip processing our own comments to prevent infinite loops
    if (actualAgentUserId && data.userId === actualAgentUserId) {
      console.log(`⏭️ Skipping processing of own comment ${data.id} (preventing infinite loop)`);
      return;
    }
    
    // Only handle comment creation events that mention the agent
    if (action === 'create') {
      await handleNewComment(data, linearClient);
    }
    
  } catch (error) {
    console.error('Comment handler error:', error);
    throw error;
  }
}

/**
 * Handle new comment creation
 */
async function handleNewComment(comment: { id: string; body: string; issueId: string; userId: string; parentId?: string }, linearClient: LinearClient): Promise<void> {
  // Check if comment mentions the agent or contains trigger words
  const commentBody = comment.body.toLowerCase();
  const agentName = process.env.LINEAR_AGENT_NAME?.toLowerCase() || 'opencode agent';
  
  // Only respond if mentioned or if contains trigger words
  const isMentioned = commentBody.includes('@' + agentName) || 
                     commentBody.includes(agentName) ||
                     commentBody.includes('help') ||
                     commentBody.includes('implement') ||
                     commentBody.includes('fix');
  
  if (!isMentioned) {
    console.log(`⏭️ Comment ${comment.id} does not mention agent - skipping response`);
    return;
  }
  
  console.log(`🎯 Agent mentioned in comment ${comment.id} - preparing response`);
  
  // Generate response based on content
  let response: string;
  
  if (commentBody.includes('help')) {
    response = `👋 Hello! I'm the OpenCode Agent. I can help you with:

• Analyzing this issue and suggesting solutions
• Creating development plans
• Connecting to OpenCode for implementation
• Answering questions about the codebase

What would you like me to help you with?`;
  } else if (commentBody.includes('implement') || commentBody.includes('fix')) {
    response = `🚀 I can help implement this issue! 

I'll analyze the requirements and create a development plan. This will involve:
1. Understanding the issue requirements
2. Creating implementation steps
3. Setting up OpenCode integration
4. Executing the development tasks

Would you like me to start with creating an implementation plan?`;
  } else {
    response = `🤖 I understand you want help with: "${comment.body}"

I can assist with development tasks, code analysis, and implementation planning. Could you provide more details about what you'd like me to help you accomplish?`;
  }
  
  // Create comment response
  await linearClient.createComment({
    issueId: comment.issueId,
    body: response,
    parentId: comment.parentId || comment.id
  });
  
  console.log(`✅ Response comment created for comment ${comment.id}`);
}
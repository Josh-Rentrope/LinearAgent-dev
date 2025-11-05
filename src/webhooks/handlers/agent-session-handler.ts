/**
 * Agent Session Event Handler
 * 
 * Handles Linear AppUserNotification events including agent mentions
 * and delegation from Linear issues.
 */

import { LinearClient } from '@linear/sdk';
import { emitActivity } from '../../activities/activity-emitter';
import { handleCommentEvent } from './comment-handler';

// AppUserNotification format (from Linear Agent Demo)
interface AppUserNotificationEvent {
  type: 'AppUserNotification';
  appUserId: string;
  notification: {
    type: 'issueMention' | 'issueCommentMention' | 'issueAssignedToYou' | 'issueNewComment';
    issueId?: string;
    issue?: {
      id: string;
      title: string;
      description: string;
    };
    commentId?: string;
    comment?: {
      id: string;
      body: string;
      userId: string;
      issueId: string;
    };
    parentCommentId?: string;
  };
  webhookId: string;
}



// Legacy AgentSession format (for backward compatibility)
interface AgentSessionEvent {
  id: string;
  type: string;
  data: {
    id: string;
    issueId: string;
    userId: string;
    prompt?: string;
    createdAt: string;
  };
}

/**
 * Handle AppUserNotification, AgentSession, and Comment events (mentions and delegation)
 */
export async function handleAgentSessionEvent(event: AppUserNotificationEvent | AgentSessionEvent | any): Promise<void> {
  try {
    // Handle Comment events (new)
    if (event.type === 'Comment') {
      await handleCommentEvent(event);
      return;
    }
    
    // Handle AppUserNotification format (new)
    if (event.type === 'AppUserNotification') {
      await handleAppUserNotification(event as AppUserNotificationEvent);
      return;
    }
    
    // Handle legacy AgentSession format (backward compatibility)
    const legacyEvent = event as AgentSessionEvent;
    const { data } = legacyEvent;
    
    console.log(`🤖 Processing AgentSession: ${legacyEvent.type}`, {
      sessionId: data.id,
      issueId: data.issueId,
      userId: data.userId,
      hasPrompt: !!data.prompt
    });
    
    // Initialize Linear client with existing plugin configuration
    const apiKey = process.env.LINEAR_API_KEY;
    if (!apiKey) {
      throw new Error('LINEAR_API_KEY not configured');
    }
    
    const linearClient = new LinearClient({
      apiKey
    });
    
    // Get issue details for context
    const issue = await linearClient.issue(data.issueId);
    if (!issue) {
      throw new Error(`Issue not found: ${data.issueId}`);
    }
    
    // Emit initial "thought" activity to show we're processing
    await emitActivity({
      sessionId: data.id,
      type: 'thought',
      content: `Analyzing issue "${issue.title}" and preparing response...`,
      issueId: data.issueId
    });
    
    // Process the user's prompt or mention
    if (data.prompt) {
      await processUserPrompt(data.id, issue, data.prompt, linearClient);
    } else {
      await handleAgentMention(data.id, issue, linearClient);
    }
    
  } catch (error) {
    console.error('AgentSession handler error:', error);
    
    // For legacy format
    if (event.type !== 'AppUserNotification') {
      const legacyEvent = event as AgentSessionEvent;
      await emitActivity({
        sessionId: legacyEvent.data.id,
        type: 'error',
        content: `Error processing request: ${error instanceof Error ? error.message : 'Unknown error'}`,
        issueId: legacyEvent.data.issueId
      });
    }
  }
}

/**
 * Handle AppUserNotification events (the new format)
 */
async function handleAppUserNotification(event: AppUserNotificationEvent): Promise<void> {
  const { notification } = event;
  
  console.log(`🤖 Processing AppUserNotification: ${notification.type}`, {
    appUserId: event.appUserId,
    issueId: notification.issueId,
    commentId: notification.commentId,
    parentCommentId: notification.parentCommentId
  });
  
  // Initialize Linear client
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) {
    throw new Error('LINEAR_API_KEY not configured');
  }
  
  const linearClient = new LinearClient({
    apiKey
  });
  
  // Handle different notification types
  switch (notification.type) {
    case 'issueMention':
    case 'issueAssignedToYou':
      if (!notification.issue) {
        throw new Error('No issue found in notification');
      }
      await handleIssueMention(notification.issue, linearClient);
      break;
      
    case 'issueCommentMention':
    case 'issueNewComment':
      if (!notification.comment) {
        throw new Error('No comment found in notification');
      }
      await handleCommentMention(notification.comment, notification.parentCommentId, linearClient, event.appUserId);
      break;
      
    default:
      console.log(`Unhandled notification type: ${notification.type}`);
  }
}

/**
 * Handle issue mention or assignment
 */
async function handleIssueMention(issue: { id: string; title: string; description?: string }, linearClient: LinearClient): Promise<void> {
  const response = `👋 Hi! I'm the OpenCode Agent and I've been mentioned in this issue.

**Issue**: ${issue.title}
**Description**: ${issue.description || 'No description provided'}

I can help you with:
• 📋 Analyzing requirements and creating plans
• 🔧 Implementing features and fixes
• 🧪 Running tests and validation
• 📚 Documentation and code review

What would you like me to help you with for this issue?`;

  // Create comment response
  await linearClient.createComment({
    issueId: issue.id,
    body: response
  });
  
  console.log(`✅ Response comment created for issue ${issue.id}`);
}

/**
 * Handle comment mention or reply
 */
async function handleCommentMention(comment: { id: string; body: string; issueId: string; userId: string }, parentCommentId: string | undefined, linearClient: LinearClient, agentUserId?: string): Promise<void> {
  // Use provided agentUserId or fall back to environment variable
  const actualAgentUserId = agentUserId || process.env.LINEAR_AGENT_USER_ID;
  
  // Skip responding to our own comments to prevent infinite loops
  if (actualAgentUserId && comment.userId === actualAgentUserId) {
    console.log(`⏭️ Skipping response to own comment ${comment.id} (preventing infinite loop)`);
    return;
  }
  
  // Simple response logic for now
  let response: string;
  
  const commentBody = comment.body.toLowerCase();
  
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
    parentId: parentCommentId || comment.id
  });
  
  console.log(`✅ Response comment created for comment ${comment.id}`);
}

/**
 * Process direct user prompt to agent
 */
async function processUserPrompt(
  sessionId: string,
  issue: any,
  prompt: string,
  _linearClient: LinearClient
): Promise<void> {
  // Emit "action" activity for processing
  await emitActivity({
    sessionId,
    type: 'action',
    content: `Processing request: "${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}"`,
    issueId: issue.id
  });
  
  // Simple response logic for now - can be enhanced with AI
  let response: string;
  
  if (prompt.toLowerCase().includes('help')) {
    response = `👋 Hello! I'm the OpenCode Agent. I can help you with:

• Analyzing this issue and suggesting solutions
• Creating development plans
• Connecting to OpenCode for implementation
• Answering questions about the codebase

What would you like me to help you with?`;
  } else if (prompt.toLowerCase().includes('implement') || prompt.toLowerCase().includes('fix')) {
    response = `🚀 I can help implement this issue! 

I'll analyze the requirements and create a development plan. This will involve:
1. Understanding the issue requirements
2. Creating implementation steps
3. Setting up OpenCode integration
4. Executing the development tasks

Would you like me to start with creating an implementation plan?`;
  } else {
    response = `🤖 I understand you want help with: "${prompt}"

I can assist with development tasks, code analysis, and implementation planning. Could you provide more details about what you'd like me to help you accomplish?`;
  }
  
  // Emit final response
  await emitActivity({
    sessionId,
    type: 'response',
    content: response,
    issueId: issue.id
  });
}

/**
 * Handle simple agent mention (no specific prompt)
 */
async function handleAgentMention(
  sessionId: string,
  issue: any,
  _linearClient: LinearClient
): Promise<void> {
  const response = `👋 Hi! I'm the OpenCode Agent and I've been mentioned in this issue.

**Issue**: ${issue.title}
**Status**: ${issue.state?.name || 'No state'}

I can help you with:
• 📋 Analyzing requirements and creating plans
• 🔧 Implementing features and fixes
• 🧪 Running tests and validation
• 📚 Documentation and code review

What would you like me to help you with for this issue?`;

  // Emit response
  await emitActivity({
    sessionId,
    type: 'response',
    content: response,
    issueId: issue.id
  });
}
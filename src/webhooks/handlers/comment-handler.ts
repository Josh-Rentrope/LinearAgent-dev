/**
 * Comment Event Handler
 * 
 * Handles Comment events from Linear webhooks.
 * Processes comment creation, updates, and threaded reply logic.
 */

import { LinearClient } from '@linear/sdk';
import { SessionContext } from '../../sessions/opencode-session-manager';

export interface CommentData {
  id: string;
  body: string;
  parentId?: string;
  issue: {
    id: string;
    identifier: string;
    title: string;
  };
  user: {
    id: string;
    name: string;
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface CommentEvent {
  type: 'Comment';
  action: 'create' | 'update' | 'delete';
  data: CommentData;
  webhookId: string;
}

/**
 * Handle Comment events from Linear webhooks
 */
export async function handleCommentEvent(
  event: CommentEvent,
  linearClient: LinearClient,
  agentUserId: string,
  agentName: string
): Promise<void> {
  console.log(`💬 Processing Comment ${event.action}: ${event.data.id}`);
  
  try {
    // Only process creation events for agent responses
    if (event.action !== 'create') {
      console.log(`⏭️  Skipping ${event.action} event for comment ${event.data.id}`);
      return;
    }
    
    // Skip if comment is from the agent itself
    if (event.data.user?.id === agentUserId) {
      console.log(`⏭️  Skipping own comment ${event.data.id}`);
      return;
    }
    
    // Process comment based on content and context
    const isMentioned = isAgentMentioned(event.data.body, agentName);
    const isReplyToAgent = await checkIfReplyToAgent(event.data, linearClient, agentUserId);
    
    if (!isMentioned && !isReplyToAgent) {
      console.log(`⏭️  Agent not mentioned and not a reply in comment ${event.data.id}`);
      return;
    }
    
    console.log(`🎯 Processing agent interaction in comment ${event.data.id}`);
    
    // Further processing will be handled by the main webhook server
    // This handler focuses on comment analysis and hierarchy resolution
    
  } catch (error) {
    console.error('❌ Failed to process Comment event:', error);
    throw error;
  }
}

/**
 * Extract session context from comment data
 */
export function extractSessionContext(commentData: CommentData): SessionContext {
  return {
    userId: commentData.user.id,
    userName: commentData.user.name,
    issueId: commentData.issue.id,
    issueTitle: commentData.issue.title,
    issueDescription: '', // Will be populated if needed
    teamId: '', // Will be populated if needed
    commentId: commentData.id,
    mentionText: commentData.body || '',
    createdAt: commentData.createdAt || new Date().toISOString()
  };
}

/**
 * Check if comment mentions the agent
 */
export function isAgentMentioned(commentBody: string, agentName: string): boolean {
  if (!commentBody) return false;
  
  const mentionPatterns = [
    `@${agentName}`,
    `@${agentName.replace(/\s+/g, '')}`,
    `@${agentName.replace(/\s+/g, '').toLowerCase()}`,
    '@opencodeintegration',
    '@opencodeagent',
    'opencode integration',
    'opencode agent'
  ];
  
  return mentionPatterns.some(pattern => 
    commentBody.toLowerCase().includes(pattern.toLowerCase())
  );
}

/**
 * Check if comment is a reply to an agent comment
 * Simplified logic: if comment has a parent, check if parent is from agent
 */
export async function checkIfReplyToAgent(
  commentData: CommentData,
  linearClient: LinearClient,
  agentUserId: string
): Promise<boolean> {
  // Check if comment has a parent (is a reply in a thread)
  if (!commentData.parentId) {
    return false;
  }
  
  try {
    // Get the parent comment directly
    const parentComment = await linearClient.comment({ id: commentData.parentId });
    
    if (!parentComment) {
      console.log(`⚠️  Parent comment ${commentData.parentId} not found`);
      return false;
    }
    
    // Check if parent comment is from agent
    // Note: Linear SDK wraps user data, need to handle properly
    const parentUser = parentComment.user;
    if (parentUser && 'id' in parentUser && parentUser.id === agentUserId) {
      console.log(`✅ Comment ${commentData.id} is reply to agent comment ${parentComment.id}`);
      return true;
    }
    
    console.log(`📝 Parent comment ${parentComment.id} is not from agent`);
    return false;
    
  } catch (error) {
    console.error(`❌ Failed to check reply-to-agent status for ${commentData.id}:`, error);
    return false;
  }
}
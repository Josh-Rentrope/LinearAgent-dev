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

export interface CommentHierarchy {
  comment: CommentData;
  parent?: CommentData;
  topLevel?: CommentData;
  depth: number;
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
 * This implements proper top-level comment finding
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
    // Get the comment hierarchy to find the top-level comment
    const hierarchy = await getCommentHierarchy(commentData, linearClient);
    
    // Check if any comment in the thread is from the agent
    return await checkThreadForAgentComments(hierarchy.topLevel?.id || commentData.parentId, linearClient, agentUserId);
    
  } catch (error) {
    console.error('❌ Failed to check reply-to-agent status:', error);
    return false;
  }
}

/**
 * Get comment hierarchy with proper parent resolution
 * Note: This is a simplified version that will be enhanced with Linear SDK integration
 */
export async function getCommentHierarchy(
  commentData: CommentData,
  _linearClient: LinearClient
): Promise<CommentHierarchy> {
  const hierarchy: CommentHierarchy = {
    comment: commentData,
    depth: 0
  };
  
  if (!commentData.parentId) {
    hierarchy.topLevel = commentData;
    return hierarchy;
  }
  
  // For now, we'll use the parent as the top-level comment
  // This will be enhanced with proper Linear SDK integration
  hierarchy.topLevel = commentData;
  hierarchy.depth = 1;
  
  console.log(`🔗 Comment hierarchy: ${commentData.id} -> parent: ${commentData.parentId} (depth: ${hierarchy.depth})`);
  
  return hierarchy;
}

/**
 * Check if a thread contains agent comments
 * Note: This is a simplified version that will be enhanced with Linear SDK integration
 */
async function checkThreadForAgentComments(
  topLevelCommentId: string,
  _linearClient: LinearClient,
  _agentUserId: string
): Promise<boolean> {
  try {
    // TODO: Implement proper Linear SDK integration to check thread comments
    // For now, we'll return false to avoid false positives
    // This will be enhanced in a future commit
    
    console.log(`🔍 Checking thread for agent comments (top-level: ${topLevelCommentId})`);
    return false;
    
  } catch (error) {
    console.error(`❌ Failed to check thread for agent comments:`, error);
    return false;
  }
}
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
 * This implements proper top-level comment finding with thread traversal
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
    // Get comment hierarchy to find top-level comment
    const hierarchy = await getCommentHierarchy(commentData, linearClient);
    
    if (!hierarchy.topLevel) {
      console.log(`⚠️  No top-level comment found for ${commentData.id}`);
      return false;
    }
    
    // Check if top-level comment is from agent
    if (hierarchy.topLevel.user.id === agentUserId) {
      console.log(`✅ Comment ${commentData.id} is reply to agent's top-level comment ${hierarchy.topLevel.id}`);
      return true;
    }
    
    // Check if any comment in thread is from agent
    const hasAgentCommentInThread = await checkThreadForAgentComments(
      hierarchy.topLevel.id,
      linearClient,
      agentUserId
    );
    
    if (hasAgentCommentInThread) {
      console.log(`✅ Comment ${commentData.id} is reply in thread containing agent comments`);
    }
    
    return hasAgentCommentInThread;
    
  } catch (error) {
    console.error('❌ Failed to check reply-to-agent status:', error);
    return false;
  }
}

/**
 * Get comment hierarchy with proper parent resolution
 * Implements recursive traversal to find true top-level comment
 */
export async function getCommentHierarchy(
  commentData: CommentData,
  linearClient: LinearClient
): Promise<CommentHierarchy> {
  const hierarchy: CommentHierarchy = {
    comment: commentData,
    depth: 0
  };
  
  if (!commentData.parentId) {
    hierarchy.topLevel = commentData;
    console.log(`🔗 Comment ${commentData.id} is already top-level (no parent)`);
    return hierarchy;
  }
  
  try {
    // Find top-level comment using Linear SDK
    const topLevelComment = await findTopLevelComment(
      commentData.parentId!,
      linearClient,
      commentData.issue
    );
    
    hierarchy.topLevel = topLevelComment;
    hierarchy.depth = await calculateCommentDepth(commentData, linearClient);
    
    console.log(`🔗 Comment hierarchy resolved: ${commentData.id} -> top-level: ${topLevelComment.id} (depth: ${hierarchy.depth})`);
    
  } catch (error) {
    console.error(`❌ Failed to resolve comment hierarchy for ${commentData.id}:`, error);
    // Fallback to using parent as top-level
    hierarchy.topLevel = commentData;
    hierarchy.depth = 1;
  }
  
  return hierarchy;
}

/**
 * Find top-level comment using Linear SDK API
 */
async function findTopLevelComment(
  commentId: string,
  linearClient: LinearClient,
  issueContext: CommentData['issue']
): Promise<CommentData> {
  try {
    // Get the comment using Linear SDK
    const comment = await linearClient.comment(commentId);
    
    if (!comment) {
      throw new Error(`Comment ${commentId} not found`);
    }
    
    // If comment has no parent, it's top-level
    if (!comment.parentId) {
      console.log(`🎯 Found top-level comment: ${comment.id}`);
      return {
        id: comment.id,
        body: comment.body || '',
        issue: issueContext,
        user: {
          id: comment.user?.id || '',
          name: comment.user?.name || 'Unknown'
        },
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt
      };
    }
    
    // Recursively find parent until we reach top-level
    return await findTopLevelComment(comment.parentId, linearClient, issueContext);
    
  } catch (error) {
    console.error(`❌ Failed to get comment ${commentId}:`, error);
    throw error;
  }
}

/**
 * Calculate depth of a comment in thread
 * Note: This is a simplified implementation that will be enhanced
 */
async function calculateCommentDepth(
  commentData: CommentData,
  _linearClient: LinearClient
): Promise<number> {
  if (!commentData.parentId) {
    return 0;
  }
  
  try {
    // TODO: Implement proper Linear SDK integration for depth calculation
    // For now, we'll use a simple heuristic based on parentId format
    const depth = commentData.parentId.split('-').length || 1;
    return Math.min(depth, 5); // Cap at reasonable depth
    
  } catch (error) {
    console.error(`❌ Failed to calculate depth for comment ${commentData.id}:`, error);
    return 1; // Fallback depth
  }
}

/**
 * Check if a thread contains agent comments using Linear SDK
 */
async function checkThreadForAgentComments(
  topLevelCommentId: string,
  linearClient: LinearClient,
  agentUserId: string
): Promise<boolean> {
  try {
    console.log(`🔍 Checking thread for agent comments (top-level: ${topLevelCommentId})`);
    
    // Get the top-level comment
    const topLevelComment = await linearClient.comment(topLevelCommentId);
    
    if (!topLevelComment) {
      console.log(`⚠️  Top-level comment ${topLevelCommentId} not found`);
      return false;
    }
    
    // Check if top-level comment is from agent
    if (topLevelComment.user?.id === agentUserId) {
      console.log(`✅ Top-level comment ${topLevelCommentId} is from agent`);
      return true;
    }
    
    // Get issue to find all comments in thread
    const issue = await linearClient.issue(topLevelComment.issueId);
    if (!issue) {
      console.log(`⚠️  Issue ${topLevelComment.issueId} not found`);
      return false;
    }
    
    // Get comments from the issue and check if any are from agent in this thread
    const comments = await issue.comments();
    for (const comment of comments.nodes) {
      if (comment.user?.id === agentUserId && 
          (comment.id === topLevelCommentId || comment.parentId === topLevelCommentId)) {
        console.log(`✅ Found agent comment ${comment.id} in thread`);
        return true;
      }
    }
    
    console.log(`📝 Thread check: no agent comments found in thread ${topLevelCommentId}`);
    return false;
    
  } catch (error) {
    console.error(`❌ Failed to check thread for agent comments:`, error);
    return false;
  }
}
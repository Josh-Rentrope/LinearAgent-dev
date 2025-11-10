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
 * @deprecated Use SessionUtils.extractSessionContext instead
 */
export function extractSessionContext(commentData: CommentData): SessionContext {
  // Import dynamically to avoid circular dependency
  const { SessionUtils } = require('../../sessions/session-utils');
  return SessionUtils.extractSessionContext(commentData);
}

/**
 * Check if comment mentions the agent
 * @deprecated Use AgentDetection.isAgentMentioned instead
 */
export function isAgentMentioned(commentBody: string, agentName: string): boolean {
  // Import dynamically to avoid circular dependency
  const { AgentDetection } = require('../utils/agent-detection');
  return AgentDetection.isAgentMentioned(commentBody, agentName);
}

/**
 * Check if comment is a reply to an agent comment
 * @deprecated Use AgentDetection.isReplyToAgent instead
 */
export async function checkIfReplyToAgent(
  commentData: CommentData,
  linearClient: LinearClient,
  agentUserId: string
): Promise<boolean> {
  // Import dynamically to avoid circular dependency
  const { AgentDetection } = require('../utils/agent-detection');
  return AgentDetection.isReplyToAgent(commentData, linearClient, agentUserId);
}
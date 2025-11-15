/**
 * Comment Event Handler
 * 
 * Handles Comment events from Linear webhooks.
 * Processes comment creation, updates, and threaded reply logic.
 */

import { LinearClient, Comment } from '@linear/sdk';
import { SessionContext } from '../../sessions/opencode-session-manager';

// WebhookPayload using any type for flexibility with diverse Linear webhook structures
// Use: handler.on("Comment", async (payload) => { ... })

export interface WebhookPayload {
  action: 'create' | 'update' | 'delete';
  data: any; // Flexible to handle various webhook data structures
  webhookId: string;
  url?: string;
  createdAt: string;
}

/**
 * Handle Comment events from Linear webhooks
 */
export async function handleCommentEvent(
  event: any, // Flexible to handle diverse Linear webhook structures
  linearClient: LinearClient,
  agentUserId: string,
  agentName: string
): Promise<void> {
  console.log(`💬 Processing Comment ${event.action}: ${event.data?.id || 'unknown'}`);
  
  try {
    // Validate event structure
  if (!event.data || typeof event.data !== 'object') {
    console.log(`⏭️  Invalid event data structure for ${event.action}`);
    return;
  }

  // Only process creation events for agent responses
  if (event.action !== 'create') {
    console.log(`⏭️  Skipping ${event.action} event for comment ${event.data.id}`);
    return;
  }
    
    // Skip if comment is from the agent itself
    const commentUser = await event.data.user;
    if (commentUser?.id === agentUserId) {
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
export function extractSessionContext(commentData: any): SessionContext {
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
  commentData: any, // Flexible to handle various webhook data structures
  linearClient: LinearClient,
  agentUserId: string
): Promise<boolean> {
  // Import dynamically to avoid circular dependency
  const { AgentDetection } = require('../utils/agent-detection');
  return AgentDetection.isReplyToAgent(commentData, linearClient, agentUserId);
}
/**
 * Agent Session Event Handler
 * 
 * Handles AppUserNotification events from Linear webhooks.
 * Processes session lifecycle events and extracts elicitation context.
 */

import { LinearClient } from '@linear/sdk';

export interface AgentSessionEvent {
  type: 'AppUserNotification';
  appUserId: string;
  notification: {
    type: string;
    comment?: {
      id: string;
      body: string;
      userId: string;
      issueId: string;
    };
    parentCommentId?: string;
    [key: string]: any;
  };
  webhookId: string;
}

export interface SessionEventData {
  sessionId?: string;
  userId: string;
  issueId: string;
  eventType: string;
  timestamp: string;
  elicitationContext?: {
    phase?: string;
    pendingQuestions?: string[];
    userIntent?: string;
    confidence?: number;
  };
}

/**
 * Handle AgentSessionEvent from Linear webhooks
 */
export async function handleAgentSessionEvent(
  event: AgentSessionEvent,
  _linearClient: LinearClient
): Promise<void> {
  console.log(`🔄 Processing AgentSessionEvent: ${event.notification.type}`);
  
  try {
    // Extract session context from notification
    const sessionData = extractSessionData(event);
    
    // Process based on notification type
    switch (event.notification.type) {
      case 'issueCommentMention':
        await handleCommentMention(sessionData);
        break;
      
      case 'sessionStarted':
        await handleSessionStarted(sessionData);
        break;
      
      case 'sessionEnded':
        await handleSessionEnded(sessionData);
        break;
      
      default:
        console.log(`⏭️  Unknown notification type: ${event.notification.type}`);
    }
    
  } catch (error) {
    console.error('❌ Failed to process AgentSessionEvent:', error);
    throw error;
  }
}

/**
 * Extract session data from AgentSessionEvent
 */
function extractSessionData(event: AgentSessionEvent): SessionEventData {
  const comment = event.notification.comment;
  
  return {
    userId: comment?.userId || event.appUserId,
    issueId: comment?.issueId || '',
    eventType: event.notification.type,
    timestamp: new Date().toISOString(),
    elicitationContext: extractElicitationContext(event)
  };
}

/**
 * Extract elicitation context from event data
 */
function extractElicitationContext(event: AgentSessionEvent): any {
  const notification = event.notification;
  
  // Extract elicitation-related data from notification
  const context: any = {};
  
  if (notification.comment?.body) {
    // Analyze comment for elicitation signals
    const body = notification.comment.body.toLowerCase();
    
    if (body.includes('?')) {
      context.userIntent = 'question';
      context.pendingQuestions = [notification.comment.body];
    }
    
    if (body.includes('help') || body.includes('guide')) {
      context.userIntent = 'help_request';
    }
    
    if (body.includes('implement') || body.includes('create')) {
      context.userIntent = 'development_task';
    }
  }
  
  return context;
}

/**
 * Handle comment mention notifications
 */
async function handleCommentMention(
  sessionData: SessionEventData
): Promise<void> {
  console.log(`💬 Comment mention detected for user ${sessionData.userId} in issue ${sessionData.issueId}`);
  
  // Additional session context processing can be added here
  // For now, we log the event for debugging
}

/**
 * Handle session started notifications
 */
async function handleSessionStarted(
  sessionData: SessionEventData
): Promise<void> {
  console.log(`🚀 Session started for user ${sessionData.userId}`);
}

/**
 * Handle session ended notifications
 */
async function handleSessionEnded(
  sessionData: SessionEventData
): Promise<void> {
  console.log(`🏁 Session ended for user ${sessionData.userId}`);
}
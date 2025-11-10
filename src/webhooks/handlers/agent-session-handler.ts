/**
 * Agent Session Event Handler
 * 
 * Handles AppUserNotification events from Linear webhooks.
 * Processes session lifecycle events and extracts elicitation context.
 * 
 * Refactored for JOS-158 to improve error handling and maintainability.
 */

import { LinearClient } from '@linear/sdk';
import { ErrorHandler } from '../../utils/error-handler';

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
    contextGathered?: string[];
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
    ErrorHandler.handleWebhookError(error, event.webhookId, 'AgentSession Event');
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
  const context: any = {
    pendingQuestions: [],
    contextGathered: []
  };
  
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
    
    // Enhanced elicitation analysis
    if (body.includes('fix') || body.includes('bug')) {
      context.userIntent = 'bug_fix';
    }
    
    if (body.includes('refactor') || body.includes('improve')) {
      context.userIntent = 'refactoring';
    }
    
    if (body.includes('test') || body.includes('testing')) {
      context.userIntent = 'testing';
    }
    
    // Determine confidence based on clarity of request
    context.confidence = calculateIntentConfidence(body);
  }
  
  return context;
}

/**
 * Calculate confidence score for user intent detection
 */
function calculateIntentConfidence(body: string): number {
  let confidence = 0.5; // Base confidence
  
  // Increase confidence for clear indicators
  if (body.includes('please') || body.includes('could you')) confidence += 0.2;
  if (body.includes('implement') || body.includes('create')) confidence += 0.2;
  if (body.includes('help')) confidence += 0.1;
  
  // Decrease confidence for ambiguous requests
  if (body.length < 10) confidence -= 0.2;
  if (body.includes('maybe') || body.includes('perhaps')) confidence -= 0.1;
  
  return Math.max(0, Math.min(1, confidence));
}

/**
 * Process elicitation context from session data
 */
async function processElicitationContext(sessionData: SessionEventData): Promise<void> {
  if (!sessionData.elicitationContext) return;
  
  const context = sessionData.elicitationContext;
  
  console.log(`🧠 Processing elicitation context:`, {
    phase: context.phase,
    userIntent: context.userIntent,
    pendingQuestions: (context.pendingQuestions?.length || 0),
    confidence: context.confidence
  });
  
  // Update elicitation phase based on context
  if (context.userIntent === 'question' && context.pendingQuestions && context.pendingQuestions.length > 0) {
    context.phase = 'clarification';
  } else if (context.userIntent === 'development_task') {
    context.phase = 'planning';
  } else if (context.userIntent === 'help_request') {
    context.phase = 'initial';
  }
  
  // Store context for future reference
  // This will be integrated with session manager in next commit
}

/**
 * Process session end elicitation
 */
async function processSessionEndElicitation(sessionData: SessionEventData): Promise<void> {
  if (!sessionData.elicitationContext) return;
  
  const context = sessionData.elicitationContext;
  
  console.log(`🏁 Processing session end elicitation:`, {
    finalPhase: context.phase,
    totalQuestions: (context.pendingQuestions?.length || 0),
    contextGathered: (context.contextGathered?.length || 0)
  });
  
  // Mark phase as completed
  context.phase = 'completed';
  
  // TODO: Store elicitation results for analysis
  // This will be integrated with session manager in next commit
}

/**
 * Handle comment mention notifications
 */
async function handleCommentMention(
  sessionData: SessionEventData
): Promise<void> {
  console.log(`💬 Comment mention detected for user ${sessionData.userId} in issue ${sessionData.issueId}`);
  
  // Process elicitation context from comment mention
  if (sessionData.elicitationContext) {
    await processElicitationContext(sessionData);
  }
  
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
  
  // Initialize elicitation context for new session
  if (sessionData.elicitationContext) {
    sessionData.elicitationContext.phase = 'initial';
    sessionData.elicitationContext.pendingQuestions = [];
    sessionData.elicitationContext.contextGathered = [];
    
    console.log(`📝 Initialized elicitation context for session: ${sessionData.userId}`);
  }
}

/**
 * Handle session ended notifications
 */
async function handleSessionEnded(
  sessionData: SessionEventData
): Promise<void> {
  console.log(`🏁 Session ended for user ${sessionData.userId}`);
  
  // Process final elicitation context
  if (sessionData.elicitationContext) {
    await processSessionEndElicitation(sessionData);
  }
}
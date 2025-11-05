/**
 * Activity Emitter for Linear Agent
 * 
 * Emits activities back to Linear to show agent progress
 * and communication with users.
 */

import { LinearClient } from '@linear/sdk';

interface Activity {
  sessionId: string;
  type: 'thought' | 'action' | 'elicitation' | 'response' | 'error';
  content: string;
  issueId: string;
  externalUrl?: string;
  signal?: {
    type: 'auth' | 'select' | 'stop';
    payload?: any;
  };
}

/**
 * Emit an activity to Linear for the agent session
 * For response activities, creates actual comments in Linear
 */
export async function emitActivity(activity: Activity): Promise<void> {
  try {
    const apiKey = process.env.LINEAR_API_KEY;
    if (!apiKey) {
      throw new Error('LINEAR_API_KEY not configured');
    }
    
    const linearClient = new LinearClient({
      apiKey
    });
    
    console.log(`📤 Emitting ${activity.type} activity:`, {
      sessionId: activity.sessionId,
      issueId: activity.issueId,
      contentLength: activity.content.length
    });
    
    // For response activities, create actual comments in Linear
    if (activity.type === 'response') {
      console.log(`💬 Creating Linear comment for issue ${activity.issueId}`);
      
      await linearClient.createComment({
        issueId: activity.issueId,
        body: activity.content
      });
      
      console.log(`✅ Comment created successfully in Linear`);
    } else {
      // For other activity types, just log for now
      console.log(`📝 Activity content: ${activity.content}`);
      console.log(`✅ Activity logged: ${activity.type}`);
    }
    
  } catch (error) {
    console.error('❌ Failed to emit activity:', error);
    // Don't throw here - activity emission failure shouldn't break main flow
  }
}

/**
 * Emit a thought activity (internal reasoning)
 */
export async function emitThought(
  sessionId: string,
  content: string,
  issueId: string
): Promise<void> {
  await emitActivity({
    sessionId,
    type: 'thought',
    content: `💭 ${content}`,
    issueId
  });
}

/**
 * Emit an action activity (tool execution)
 */
export async function emitAction(
  sessionId: string,
  content: string,
  issueId: string,
  externalUrl?: string
): Promise<void> {
  await emitActivity({
    sessionId,
    type: 'action',
    content: `⚡ ${content}`,
    issueId,
    ...(externalUrl && { externalUrl })
  });
}

/**
 * Emit an elicitation activity (question to user)
 */
export async function emitElicitation(
  sessionId: string,
  content: string,
  issueId: string
): Promise<void> {
  await emitActivity({
    sessionId,
    type: 'elicitation',
    content: `❓ ${content}`,
    issueId
  });
}

/**
 * Emit a response activity (final answer)
 */
export async function emitResponse(
  sessionId: string,
  content: string,
  issueId: string
): Promise<void> {
  await emitActivity({
    sessionId,
    type: 'response',
    content: content,
    issueId
  });
}

/**
 * Emit an error activity
 */
export async function emitError(
  sessionId: string,
  content: string,
  issueId: string
): Promise<void> {
  await emitActivity({
    sessionId,
    type: 'error',
    content: `❌ ${content}`,
    issueId
  });
}
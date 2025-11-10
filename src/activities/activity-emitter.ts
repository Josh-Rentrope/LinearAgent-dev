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
  parentCommentId?: string; // For threaded replies
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
    // Use bot OAuth token for comment creation to avoid infinite loops
    const botOAuthToken = process.env.LINEAR_BOT_OAUTH_TOKEN;
    const apiKey = process.env.LINEAR_API_KEY;
    
    if (!botOAuthToken && !apiKey) {
      throw new Error('Neither LINEAR_BOT_OAUTH_TOKEN nor LINEAR_API_KEY configured');
    }
    
    // Prefer bot OAuth token for comments, fall back to API key
    const token = botOAuthToken || apiKey;
    const linearClient = new LinearClient({
      apiKey: token!
    });
    
    console.log(`📤 Emitting ${activity.type} activity:`, {
      sessionId: activity.sessionId,
      issueId: activity.issueId,
      contentLength: activity.content.length
    });
    
    // For response activities, create actual comments in Linear
    if (activity.type === 'response') {
      console.log(`💬 Creating Linear comment for issue ${activity.issueId}`);
      
      const commentData: any = {
        issueId: activity.issueId,
        body: activity.content
      };
      
      // For Linear, threaded replies must reply to top-level comments only
      // Skip parent ID for replies to non-top-level comments to avoid API errors
      if (activity.parentCommentId) {
        console.log(`📝 Creating threaded reply to comment ${activity.parentCommentId}`);
        // Note: Linear API only allows replies to top-level comments
        // This parentId will be validated before comment creation
        commentData.parentId = activity.parentCommentId;
      } else {
        console.log(`📝 Creating top-level comment`);
      }
      
      let result;
      try {
        result = await linearClient.createComment(commentData);
      } catch (error) {
        // Handle threading API errors by falling back to top-level comment
        if (commentData.parentId && error instanceof Error && error.message.includes('Parent comment must be a top level comment')) {
          console.log(`⚠️  Threading error, falling back to top-level comment`);
          delete commentData.parentId;
          result = await linearClient.createComment(commentData);
        } else {
          throw error;
        }
      }
      
      // Check if comment creation was successful
      if (!result?.success) {
        throw new Error(`Failed to create comment: ${result}`);
      }
      
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
  issueId: string,
  parentCommentId?: string
): Promise<void> {
  await emitActivity({
    sessionId,
    type: 'response',
    content: content,
    issueId,
    ...(parentCommentId && { parentCommentId })
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
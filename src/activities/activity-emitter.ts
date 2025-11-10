/**
 * Activity Emitter for Linear Agent
 * 
 * Emits activities back to Linear to show agent progress
 * and communication with users.
 * 
 * Refactored for JOS-158 to improve error handling and maintainability.
 */

import { LinearClient } from '@linear/sdk';
import { ErrorHandler } from '../utils/error-handler';

/**
 * Find the top-level comment in a thread
 */
async function findTopLevelComment(
  commentId: string,
  linearClient: LinearClient
): Promise<string> {
  try {
    const comment = await linearClient.comment({ id: commentId });
    
    if (!comment) {
      throw new Error(`Comment ${commentId} not found`);
    }
    
    //const commentUser = await comment.user;
    const commentParent = await comment.parent;
    // If comment has no parent, it's top-level
    if (!commentParent) {
      console.log(`🎯 Comment ${commentId} is already top-level`);
      return commentId;
    }
    
    // Recursively find parent until we reach top-level
    return await commentParent.id
    
  } catch (error) {
    console.error(`❌ Failed to find top-level comment for ${commentId}:`, error);
    throw error;
  }
}

interface Activity {
  sessionId: string;
  type: 'thought' | 'action' | 'elicitation' | 'response' | 'error' | 'progress';
  content: string;
  issueId: string;
  externalUrl?: string;
  parentCommentId?: string; // For threaded replies
  signal?: {
    type: 'auth' | 'select' | 'stop';
    payload?: any;
  };
  progress?: {
    current: number;
    total: number;
    stage: string;
    estimatedCompletion?: string | undefined;
  };
}

/**
 * Emit an activity to Linear for the agent session
 * For response activities, creates actual comments in Linear
 */
export async function emitActivity(activity: Activity): Promise<void> {
  try {
    // Use only bot OAuth token for consistent authentication
    const botOAuthToken = process.env.LINEAR_BOT_OAUTH_TOKEN;
    
    if (!botOAuthToken) {
      throw new Error('LINEAR_BOT_OAUTH_TOKEN not configured');
    }
    
    const linearClient = new LinearClient({
      apiKey: botOAuthToken
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
      // When creating a reply, find the top-level comment to ensure proper threading
      if (activity.parentCommentId) {
        console.log(`📝 Creating threaded reply to comment ${activity.parentCommentId}`);
        
        try {
          // Find the top-level comment in the thread
          const topLevelCommentId = await findTopLevelComment(activity.parentCommentId, linearClient);
          console.log(`🔗 Using top-level comment ${topLevelCommentId} for reply`);
          
          // Set parent to top-level comment for proper threading
          commentData.parentId = topLevelCommentId;
        } catch (error) {
          console.log(`⚠️  Failed to find top-level comment, creating top-level comment instead`);
          // Fallback to creating top-level comment
          delete commentData.parentId;
        }
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
            throw ErrorHandler.handleLinearApiError(error, 'Comment Creation');
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
    ErrorHandler.handleWebhookError(error, activity.sessionId, 'Activity Emission');
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

/**
 * Emit a progress activity with detailed tracking
 */
export async function emitProgress(
  sessionId: string,
  progress: number,
  stage: string,
  issueId: string,
  estimatedCompletion?: string
): Promise<void> {
  const progressIcon = progress === 100 ? '✅' : progress >= 75 ? '🔄' : progress >= 50 ? '⚡' : '📊';
  const content = estimatedCompletion 
    ? `${progressIcon} **Progress: ${progress}%** - ${stage} (ETA: ${estimatedCompletion})`
    : `${progressIcon} **Progress: ${progress}%** - ${stage}`;
    
  await emitActivity({
    sessionId,
    type: 'progress',
    content,
    issueId,
    progress: {
      current: progress,
      total: 100,
      stage,
      estimatedCompletion 
    }
  });
}

/**
 * Update Linear issue status based on progress
 */
export async function updateIssueStatus(
  issueId: string,
  status: 'todo' | 'in_progress' | 'done' | 'canceled',
  linearClient?: LinearClient | null | undefined
): Promise<void> {
  try {
    if (!linearClient) {
      const botOAuthToken = process.env.LINEAR_BOT_OAUTH_TOKEN;
      if (!botOAuthToken) return;
      
      linearClient = new LinearClient({ apiKey: botOAuthToken });
    }
    
    // Get the issue to find the appropriate workflow state
    const issue = await linearClient.issue(issueId);
    if (!issue) return;

    // Get team workflow states
    const team = await issue.team;
    if (!team) return;

    const workflowStates = await team.states();
    const targetState = workflowStates.nodes.find(state => {
      switch (status) {
        case 'todo': return state.type === 'backlog' || state.type === 'unstarted';
        case 'in_progress': return state.type === 'started' || state.type === 'in_progress';
        case 'done': return state.type === 'completed' || state.type === 'done';
        case 'canceled': return state.type === 'canceled' || state.type === 'cancelled';
        default: return false;
      }
    });

    if (targetState) {
      await issue.update({ stateId: targetState.id });
      console.log(`🔄 Updated issue ${issueId} status to: ${targetState.name}`);
    }
  } catch (error) {
    console.error('❌ Failed to update issue status:', error);
  }
}
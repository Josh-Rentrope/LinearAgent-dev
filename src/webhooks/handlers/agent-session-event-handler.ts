/**
 * Agent Session Event Handler
 * 
 * Handles Linear AgentSession events including agent creation
 * and prompting from Linear issues.
 */

import { LinearClient } from '@linear/sdk';
import { emitActivity } from '../../activities/activity-emitter';

// AgentSessionEvent format (from Linear webhooks)
interface AgentSessionEvent {
  type: 'AgentSessionEvent';
  action: 'created' | 'prompted';
  createdAt: string;
  organizationId: string;
  oauthClientId: string;
  appUserId: string;
  agentSession: {
    id: string;
    createdAt: string;
    updatedAt: string;
    archivedAt: string | null;
    creatorId: string;
    appUserId: string;
    commentId: string;
    issueId: string;
    status: string;
    startedAt: string | null;
    endedAt: string | null;
    dismissedAt: string | null;
    type: string;
    externalLink: string | null;
    summary: string | null;
    sourceMetadata: {
      type: string;
      agentSessionMetadata: {
        sourceCommentId: string;
      };
    };
    plan: string | null;
    organizationId: string;
    creator: {
      id: string;
      name: string;
      email: string;
      avatarUrl: string;
      url: string;
    };
    comment: {
      id: string;
      body: string;
      userId: string;
      issueId: string;
    };
    issue: {
      id: string;
      title: string;
      teamId: string;
      team: {
        id: string;
        key: string;
        name: string;
      };
      identifier: string;
      url: string;
      description: string;
    };
  };
  agentActivity?: {
    id: string;
    createdAt: string;
    updatedAt: string;
    archivedAt: string | null;
    agentSessionId: string;
    sourceCommentId: string;
    userId: string;
    sourceMetadata: string | null;
    signal: string | null;
    signalMetadata: string | null;
    ephemeral: boolean;
    contextualMetadata: string | null;
    content: {
      type: string;
      body: string;
    };
  };
  webhookId: string;
}

/**
 * Handle AgentSession events (created, prompted)
 */
export async function handleAgentSessionEvent(event: AgentSessionEvent): Promise<void> {
  try {
    const { action, agentSession, agentActivity } = event;
    
    console.log(`🤖 Processing AgentSession: ${action}`, {
      sessionId: agentSession.id,
      issueId: agentSession.issueId,
      userId: agentSession.creatorId,
      hasActivity: !!agentActivity
    });
    
    // Initialize Linear client
    const apiKey = process.env.LINEAR_API_KEY;
    if (!apiKey) {
      throw new Error('LINEAR_API_KEY not configured');
    }
    
    const linearClient = new LinearClient({
      apiKey
    });
    
    // Get issue details for context
    const issue = await linearClient.issue(agentSession.issueId);
    if (!issue) {
      throw new Error(`Issue not found: ${agentSession.issueId}`);
    }
    
    // Handle different actions
    switch (action) {
      case 'created':
        await handleAgentSessionCreated(agentSession, issue, linearClient);
        break;
        
      case 'prompted':
        await handleAgentSessionPrompted(agentSession, agentActivity, issue, linearClient);
        break;
        
      default:
        console.log(`Unhandled AgentSession action: ${action}`);
    }
    
  } catch (error) {
    console.error('AgentSession handler error:', error);
    throw error;
  }
}

/**
 * Handle agent session creation
 */
async function handleAgentSessionCreated(
  agentSession: AgentSessionEvent['agentSession'], 
  issue: any, 
  _linearClient: LinearClient
): Promise<void> {
  console.log(`🎯 Agent session created: ${agentSession.id}`);
  
  // Emit initial "thought" activity to show we're processing
  await emitActivity({
    sessionId: agentSession.id,
    type: 'thought',
    content: `Agent session created for issue "${issue.title}". Ready to assist!`,
    issueId: agentSession.issueId
  });
}

/**
 * Handle agent session prompting (user interaction)
 */
async function handleAgentSessionPrompted(
  agentSession: AgentSessionEvent['agentSession'],
  agentActivity: AgentSessionEvent['agentActivity'],
  _issue: any,
  _linearClient: LinearClient
): Promise<void> {
  console.log(`💬 Agent session prompted: ${agentSession.id}`);
  
  if (!agentActivity) {
    console.log('No agent activity found in session prompt');
    return;
  }
  
  // Extract the user's original prompt from the source comment
  const userPrompt = agentSession.comment?.body || agentActivity.content?.body || '';
  
  if (!userPrompt) {
    console.log('No user prompt found');
    return;
  }
  
  console.log(`📝 User prompt: "${userPrompt.substring(0, 100)}${userPrompt.length > 100 ? '...' : ''}"`);
  
  // Generate response based on user prompt
  let response: string;
  
  const promptLower = userPrompt.toLowerCase();
  
  if (promptLower.includes('help')) {
    response = `👋 Hello! I'm the OpenCode Agent. I can help you with:

• Analyzing this issue and suggesting solutions
• Creating development plans
• Connecting to OpenCode for implementation
• Answering questions about the codebase

What would you like me to help you with?`;
  } else if (promptLower.includes('implement') || promptLower.includes('fix')) {
    response = `🚀 I can help implement this issue! 

I'll analyze the requirements and create a development plan. This will involve:
1. Understanding the issue requirements
2. Creating implementation steps
3. Setting up OpenCode integration
4. Executing the development tasks

Would you like me to start with creating an implementation plan?`;
  } else if (promptLower.includes('joke')) {
    response = `Why do programmers prefer dark mode? 

Because light attracts bugs! 🐛

Want to hear another one or shall we get back to work?`;
  } else {
    response = `🤖 I understand you want help with: "${userPrompt}"

I can assist with development tasks, code analysis, and implementation planning. Could you provide more details about what you'd like me to help you accomplish?`;
  }
  
  // Emit response activity (this will create the comment)
  await emitActivity({
    sessionId: agentSession.id,
    type: 'response',
    content: response,
    issueId: agentSession.issueId
  });
  
  console.log(`✅ Response generated for agent session ${agentSession.id}`);
}
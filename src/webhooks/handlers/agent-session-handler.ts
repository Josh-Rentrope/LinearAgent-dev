/**
 * Agent Session Event Handler
 * 
 * Handles Linear AgentSession events including agent mentions
 * and delegation from Linear issues.
 */

import { LinearClient } from '@linear/sdk';
import { emitActivity } from '../../activities/activity-emitter';

interface AgentSessionEvent {
  id: string;
  type: string;
  data: {
    id: string;
    issueId: string;
    userId: string;
    prompt?: string;
    createdAt: string;
  };
}

/**
 * Handle AgentSession events (mentions and delegation)
 */
export async function handleAgentSessionEvent(event: AgentSessionEvent): Promise<void> {
  const { data } = event;
  
  try {
    console.log(`🤖 Processing AgentSession: ${event.type}`, {
      sessionId: data.id,
      issueId: data.issueId,
      userId: data.userId,
      hasPrompt: !!data.prompt
    });
    
    // Initialize Linear client with existing plugin configuration
    const apiKey = process.env.LINEAR_API_KEY;
    if (!apiKey) {
      throw new Error('LINEAR_API_KEY not configured');
    }
    
    const linearClient = new LinearClient({
      apiKey
    });
    
    // Get issue details for context
    const issue = await linearClient.issue(data.issueId);
    if (!issue) {
      throw new Error(`Issue not found: ${data.issueId}`);
    }
    
    // Emit initial "thought" activity to show we're processing
    await emitActivity({
      sessionId: data.id,
      type: 'thought',
      content: `Analyzing issue "${issue.title}" and preparing response...`,
      issueId: data.issueId
    });
    
    // Process the user's prompt or mention
    if (data.prompt) {
      await processUserPrompt(data.id, issue, data.prompt, linearClient);
    } else {
      await handleAgentMention(data.id, issue, linearClient);
    }
    
  } catch (error) {
    console.error('AgentSession handler error:', error);
    
    // Emit error activity
    await emitActivity({
      sessionId: data.id,
      type: 'error',
      content: `Error processing request: ${error instanceof Error ? error.message : 'Unknown error'}`,
      issueId: data.issueId
    });
  }
}

/**
 * Process direct user prompt to agent
 */
async function processUserPrompt(
  sessionId: string,
  issue: any,
  prompt: string,
  _linearClient: LinearClient
): Promise<void> {
  // Emit "action" activity for processing
  await emitActivity({
    sessionId,
    type: 'action',
    content: `Processing request: "${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}"`,
    issueId: issue.id
  });
  
  // Simple response logic for now - can be enhanced with AI
  let response: string;
  
  if (prompt.toLowerCase().includes('help')) {
    response = `👋 Hello! I'm the OpenCode Agent. I can help you with:

• Analyzing this issue and suggesting solutions
• Creating development plans
• Connecting to OpenCode for implementation
• Answering questions about the codebase

What would you like me to help you with?`;
  } else if (prompt.toLowerCase().includes('implement') || prompt.toLowerCase().includes('fix')) {
    response = `🚀 I can help implement this issue! 

I'll analyze the requirements and create a development plan. This will involve:
1. Understanding the issue requirements
2. Creating implementation steps
3. Setting up OpenCode integration
4. Executing the development tasks

Would you like me to start with creating an implementation plan?`;
  } else {
    response = `🤖 I understand you want help with: "${prompt}"

I can assist with development tasks, code analysis, and implementation planning. Could you provide more details about what you'd like me to help you accomplish?`;
  }
  
  // Emit final response
  await emitActivity({
    sessionId,
    type: 'response',
    content: response,
    issueId: issue.id
  });
}

/**
 * Handle simple agent mention (no specific prompt)
 */
async function handleAgentMention(
  sessionId: string,
  issue: any,
  _linearClient: LinearClient
): Promise<void> {
  const response = `👋 Hi! I'm the OpenCode Agent and I've been mentioned in this issue.

**Issue**: ${issue.title}
**Status**: ${issue.state?.name || 'No state'}

I can help you with:
• 📋 Analyzing requirements and creating plans
• 🔧 Implementing features and fixes
• 🧪 Running tests and validation
• 📚 Documentation and code review

What would you like me to help you with for this issue?`;

  // Emit response
  await emitActivity({
    sessionId,
    type: 'response',
    content: response,
    issueId: issue.id
  });
}
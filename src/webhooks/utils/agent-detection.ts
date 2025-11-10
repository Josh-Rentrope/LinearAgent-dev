/**
 * Agent Detection Utilities
 * 
 * Consolidated agent mention and reply detection logic to eliminate
 * duplicate patterns across webhook handlers and improve consistency.
 * 
 * @issue JOS-158
 */

import { LinearClient } from '@linear/sdk';
import { CommentData } from '../handlers/comment-handler';

/**
 * Consolidated agent detection utilities
 */
export class AgentDetection {
  /**
   * Get all mention patterns for the agent
   */
  static getMentionPatterns(agentName: string): string[] {
    return [
      `@${agentName}`,
      `@${agentName.replace(/\s+/g, '')}`,
      `@${agentName.replace(/\s+/g, '').toLowerCase()}`,
      '@opencodeintegration',
      '@opencodeagent',
      'opencode integration',
      'opencode agent'
    ];
  }

  /**
   * Check if comment mentions the agent
   * Single source of truth for mention detection
   */
  static isAgentMentioned(commentBody: string, agentName: string): boolean {
    if (!commentBody) return false;
    
    const mentionPatterns = this.getMentionPatterns(agentName);
    
    return mentionPatterns.some(pattern => 
      commentBody.toLowerCase().includes(pattern.toLowerCase())
    );
  }

  /**
   * Check if top comment/description mentions the agent
   * Used for issue descriptions and top-level comments
   */
  static isAgentMentionedInTopComment(topComment: string, agentName: string): boolean {
    if (!topComment) return false;
    
    const mentionPatterns = this.getMentionPatterns(agentName);
    
    return mentionPatterns.some(pattern => 
      topComment.toLowerCase().includes(pattern.toLowerCase())
    );
  }

  /**
   * Check if comment is a help/guide request
   */
  static isHelpRequest(commentBody: string): boolean {
    const helpPatterns = [
      '@opencodeintegration help',
      '@opencodeintegration guide',
      '@opencodeagent help', 
      '@opencodeagent guide',
      'help',
      'guide'
    ];

    const lowerBody = commentBody.toLowerCase().trim();
    return helpPatterns.some(pattern => 
      lowerBody === pattern || 
      lowerBody.endsWith(pattern) || 
      lowerBody.includes(pattern)
    );
  }

  /**
   * Check if comment is a reply to an agent comment
   * Consolidated logic with caching for performance
   */
  static async isReplyToAgent(
    commentData: CommentData,
    linearClient: LinearClient,
    agentUserId: string
  ): Promise<boolean> {
    // Check if comment has a parent (is a reply in a thread)
    if (!commentData.parentId) {
      return false;
    }
    
    try {
      // Get the parent comment directly
      const parentComment = await linearClient.comment({ id: commentData.parentId });
      
      if (!parentComment) {
        console.log(`⚠️  Parent comment ${commentData.parentId} not found`);
        return false;
      }
      
      // Check if parent comment is from agent
      const parentUser = parentComment.user;
      if (parentUser && 'id' in parentUser && parentUser.id === agentUserId) {
        console.log(`✅ Comment ${commentData.id} is reply to agent comment ${parentComment.id}`);
        return true;
      }
      
      console.log(`📝 Parent comment ${parentComment.id} is not from agent`);
      return false;
      
    } catch (error) {
      console.error(`❌ Failed to check reply-to-agent status for ${commentData.id}:`, error);
      return false;
    }
  }

  /**
   * Check if comment should be processed based on agent interaction
   */
  static async shouldProcessComment(
    commentData: CommentData,
    agentName: string,
    linearClient: LinearClient,
    agentUserId: string
  ): Promise<{ shouldProcess: boolean; reason: string; isMentioned: boolean; isReply: boolean }> {
    const isMentioned = this.isAgentMentioned(commentData.body, agentName);
    const isReply = await this.isReplyToAgent(commentData, linearClient, agentUserId);
    
    if (!isMentioned && !isReply) {
      return {
        shouldProcess: false,
        reason: 'Agent not mentioned and not a reply to agent',
        isMentioned: false,
        isReply: false
      };
    }

    let reason = '';
    if (isReply && !isMentioned) {
      reason = `Threaded reply to agent (parent: ${commentData.parentId})`;
    } else if (isMentioned && isReply) {
      reason = `Agent mentioned in threaded reply`;
    } else {
      reason = `Agent mentioned in comment`;
    }

    return {
      shouldProcess: true,
      reason,
      isMentioned,
      isReply
    };
  }

  /**
   * Check if issue should be processed based on top comment/description
   */
  static shouldProcessIssue(topComment: string, agentName: string): { shouldProcess: boolean; reason: string } {
    const isMentioned = this.isAgentMentionedInTopComment(topComment, agentName);
    
    if (!isMentioned) {
      return {
        shouldProcess: false,
        reason: 'Agent not mentioned in issue description'
      };
    }

    return {
      shouldProcess: true,
      reason: 'Agent mentioned in issue description'
    };
  }

  /**
   * Extract mention type from comment
   */
  static getMentionType(commentBody: string, agentName: string): 'direct' | 'indirect' | 'help' | 'none' {
    if (!commentBody) return 'none';
    
    const lowerBody = commentBody.toLowerCase();
    
    if (this.isHelpRequest(commentBody)) {
      return 'help';
    }
    
    const directPatterns = [`@${agentName.toLowerCase()}`, `@${agentName.replace(/\s+/g, '').toLowerCase()}`];
    const indirectPatterns = ['opencode integration', 'opencode agent'];
    
    if (directPatterns.some(pattern => lowerBody.includes(pattern))) {
      return 'direct';
    }
    
    if (indirectPatterns.some(pattern => lowerBody.includes(pattern))) {
      return 'indirect';
    }
    
    return 'none';
  }

  /**
   * Generate help/guide response
   */
  static generateHelpResponse(): string {
    return `👋 **Welcome to OpenCode Integration!**

I'm here to help you with development tasks and code-related work. Here are some ways I can assist:

**🛠️ Development Tasks:**
• Implement new features and functionality
• Debug and fix issues in your codebase
• Review and optimize existing code
• Create tests and improve test coverage
• Refactor code for better maintainability
• Set up project configurations and tooling

**📋 TODO Management:**
• Create TODOs from your requests: "Create a todo to implement X"
• View current TODOs: "Show todo list"
• Mark TODOs complete: "Mark todo [ID] complete"
• Link tasks to Linear issues automatically

**💬 Session-Based Work:**
• Start a development session by mentioning me with any task
• I'll maintain context across multiple messages
• Perfect for complex, multi-step projects
• Sessions automatically timeout after 30 minutes

**📝 Example Prompts:**
• \`@opencodeintegration implement user authentication\`
• \`@opencodeintegration create todo to fix the login bug\`
• \`@opencodeintegration show todo list\`
• \`@opencodeintegration review this pull request\`

**🚀 Getting Started:**
Just mention me with any development task, and I'll create a session to help you accomplish it!

Need more specific guidance? Just ask what you're working on!`;
  }
}
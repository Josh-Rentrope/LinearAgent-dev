/**
 * Linear Agent Webhook Server
 * 
 * Main webhook server for handling Linear events and agent mentions.
 * Uses bot OAuth token to prevent infinite loops and integrates with OpenCode LLM.
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { LinearClient } from '@linear/sdk';
import { linearWebhookMiddleware } from '../security/signature-verification';
import { emitResponse } from '../activities/activity-emitter';
import { openCodeClient } from '../integrations/opencode-client';
import OpenCodeSessionManager, { SessionContext } from '../sessions/opencode-session-manager';



interface CommentData {
  id: string;
  body: string;
  issue: {
    id: string;
    identifier: string;
    title: string;
  };
  user: {
    id: string;
    name: string;
  };
}

class LinearAgentWebhookServer {
  private app: express.Application;
  private linearClient: LinearClient | null = null;
  private agentUserId: string | null = null;
  private agentName: string;
  private processedComments = new Set<string>();
  private sessionManager: OpenCodeSessionManager;
  
  constructor() {
    this.app = express();
    this.agentName = process.env.LINEAR_AGENT_NAME || 'OpenCode Agent';
    this.sessionManager = new OpenCodeSessionManager();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(helmet());
    this.app.use(cors());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use('/webhooks/linear-agent', linearWebhookMiddleware);
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (_req, res) => {
      res.json({ 
        status: 'healthy', 
        agent: this.agentName,
        timestamp: new Date().toISOString()
      });
    });

    // Main webhook endpoint
    this.app.post('/webhooks/linear-agent', this.handleWebhook.bind(this));
  }

  /**
   * Initialize the Linear client with bot OAuth token
   */
  private async initializeLinearClient(): Promise<boolean> {
    try {
      const botOAuthToken = process.env.LINEAR_BOT_OAUTH_TOKEN;
      
      if (!botOAuthToken) {
        console.error('❌ LINEAR_BOT_OAUTH_TOKEN not configured');
        return false;
      }

      this.linearClient = new LinearClient({ apiKey: botOAuthToken });
      
      // Get bot user info
      const viewer = await this.linearClient.viewer;
      if (!viewer) {
        console.error('❌ Failed to get bot user info');
        return false;
      }

      this.agentUserId = viewer.id;
      console.log(`✅ Bot initialized: ${viewer.name} (${viewer.id})`);
      
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize Linear client:', error);
      return false;
    }
  }

  /**
   * Check if comment mentions the agent
   */
  private isAgentMentioned(commentBody: string): boolean {
    const mentionPatterns = [
      `@${this.agentName}`,
      `@${this.agentName.replace(/\s+/g, '')}`,
      `@${this.agentName.replace(/\s+/g, '').toLowerCase()}`,
      '@opencodeintegration', // Handle the actual mention from logs
      '@opencodeagent',
      'opencode integration',
      'opencode agent'
    ];
    
    return mentionPatterns.some(pattern => 
      commentBody.toLowerCase().includes(pattern.toLowerCase())
    );
  }

  /**
   * Check if comment should trigger a session (complex request)
   */
  private shouldCreateSession(commentBody: string): boolean {
    const sessionTriggers = [
      'help me',
      'can you help',
      'i need help',
      'assist me',
      'work on',
      'implement',
      'create',
      'build',
      'develop',
      'debug',
      'fix',
      'analyze',
      'review',
      'session',
      'start a session',
      'let\'s work',
      'let us work'
    ];

    const lowerBody = commentBody.toLowerCase();
    return sessionTriggers.some(trigger => lowerBody.includes(trigger)) ||
           lowerBody.length > 200; // Long comments likely need sessions
  }

  /**
   * Extract session context from comment data
   */
  private extractSessionContext(commentData: CommentData): SessionContext | null {
    try {
      if (!commentData.issue || !commentData.user) {
        return null;
      }

      return {
        issueId: commentData.issue.id,
        issueTitle: commentData.issue.title,
        issueDescription: '', // Would need additional API call to get description
        userId: commentData.user.id,
        userName: commentData.user.name,
        teamId: '', // Would need additional API call to get team ID
        commentId: commentData.id,
        mentionText: commentData.body,
        createdAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ Error extracting session context:', error);
      return null;
    }
  }

  /**
   * Generate response using OpenCode LLM
   */
  private async generateOpenCodeResponse(
    comment: string, 
    issueTitle: string, 
    issueIdentifier: string
  ): Promise<string> {
    try {
      console.log(`🤖 Generating OpenCode response for issue ${issueIdentifier}`);
      
      const response = await openCodeClient.generateLinearResponse(
        comment,
        issueTitle,
        issueIdentifier
      );

      console.log(`✅ OpenCode response generated for issue ${issueIdentifier}`);
      return response;

    } catch (error) {
      console.error('❌ Failed to generate OpenCode response:', error);
      return `Hi! 👋 I'm the ${this.agentName}. I see you mentioned me, but I'm having trouble connecting to my AI services right now. I'm here to help with development tasks - could you try again in a few moments?`;
    }
  }

  /**
   * Handle session-based response
   */
  private async handleSessionResponse(
    sessionContext: SessionContext,
    commentBody: string
  ): Promise<string> {
    try {
      console.log(`🔄 Handling session response for issue ${sessionContext.issueId}`);

      // Check if session already exists
      let session = this.sessionManager.getSessionByIssue(
        sessionContext.issueId,
        sessionContext.userId
      );

      if (!session) {
        // Create new session
        console.log(`🆕 Creating new session for issue ${sessionContext.issueId}`);
        session = await this.sessionManager.createSession(sessionContext, {
          timeoutMinutes: 30,
          maxMessages: 50
        });

        // Create OpenCode session if available
        if (openCodeClient.isSessionEnabled()) {
          try {
            const opencodeSession = await openCodeClient.createSession(
              sessionContext,
              commentBody
            );
            
            this.sessionManager.linkOpenCodeSession(
              session.id,
              opencodeSession.sessionId
            );
            
            this.sessionManager.updateSessionStatus(session.id, 'active');
            
            return `🚀 **Session Started!** I've created a dedicated session to help you with this issue. I'll maintain context across our conversation and provide more detailed assistance.

**Session Details:**
- Issue: ${sessionContext.issueTitle}
- Session ID: ${session.id}
- Status: Active

I'm ready to help! What would you like to work on? 🛠️`;

          } catch (sessionError) {
            console.error('❌ Failed to create OpenCode session:', sessionError);
            this.sessionManager.updateSessionStatus(session.id, 'error');
            
            // Fall back to regular response
            return await this.generateOpenCodeResponse(
              commentBody,
              sessionContext.issueTitle,
              sessionContext.issueId
            );
          }
        } else {
          // Session API not available, use regular response
          return await this.generateOpenCodeResponse(
            commentBody,
            sessionContext.issueTitle,
            sessionContext.issueId
          );
        }
      } else {
        // Existing session found
        console.log(`📋 Using existing session ${session.id}`);
        
        if (session.status === 'active' && session.opencodeSessionId) {
          // Add user message to session
          this.sessionManager.addMessage(
            session.id,
            'user',
            commentBody,
            { linearCommentId: sessionContext.commentId }
          );

          // Generate response using session
          const response = await openCodeClient.generateSessionResponse(
            session,
            commentBody
          );

          // Add assistant response to session
          this.sessionManager.addMessage(
            session.id,
            'assistant',
            response,
            { opencodeMessageId: 'generated' }
          );

          return response;
        } else {
          // Session not active, fall back to regular response
          return await this.generateOpenCodeResponse(
            commentBody,
            sessionContext.issueTitle,
            sessionContext.issueId
          );
        }
      }

    } catch (error) {
      console.error('❌ Session response handling failed:', error);
      return await this.generateOpenCodeResponse(
        commentBody,
        sessionContext.issueTitle,
        sessionContext.issueId
      );
    }
  }

  /**
   * Handle incoming webhook events
   */
  private async handleWebhook(req: express.Request, res: express.Response): Promise<void> {
    try {
      const event = req.body;
      
      // Debug: Log full webhook payload structure
      console.log('🔍 Full webhook payload:', JSON.stringify(event, null, 2));
      
      // Validate webhook payload structure
      if (!event) {
        console.error('❌ No webhook payload received');
        res.status(400).json({ error: 'No payload received' });
        return;
      }

      console.log(`📥 Webhook event details:`, {
        action: event.action,
        type: event.type,
        hasData: !!event.data,
        dataType: event.data?.type,
        url: event.url
      });

      // Only handle Comment events (type is at root level, not in data)
      if (event.type !== 'Comment') {
        console.log(`⏭️  Skipping non-Comment event: ${event.type}`);
        res.json({ received: true });
        return;
      }

      // Check if event.data exists and has required fields
      if (!event.data || typeof event.data !== 'object') {
        console.log('⏭️  No event.data object, skipping');
        res.json({ received: true });
        return;
      }

      const commentData = event.data as unknown as CommentData;
      
      // Validate comment data structure
      if (!commentData.id) {
        console.error('❌ Comment data missing required id field');
        res.status(400).json({ error: 'Invalid comment data' });
        return;
      }

      console.log(`📝 Processing comment ${commentData.id}:`, {
        hasBody: !!commentData.body,
        hasUser: !!commentData.user,
        hasIssue: !!commentData.issue,
        bodyPreview: commentData.body?.substring(0, 100) + (commentData.body?.length > 100 ? '...' : '')
      });
      
      // Skip if we've already processed this comment
      if (this.processedComments.has(commentData.id)) {
        console.log(`⏭️  Already processed comment ${commentData.id}, skipping`);
        res.json({ received: true });
        return;
      }

      // Mark as processed to prevent duplicates
      this.processedComments.add(commentData.id);

      // Skip if comment is from the agent itself
      if (commentData.user?.id === this.agentUserId) {
        console.log(`⏭️  Skipping own comment ${commentData.id}`);
        res.json({ received: true });
        return;
      }

      // Check if agent is mentioned
      if (!commentData.body || !this.isAgentMentioned(commentData.body)) {
        console.log(`⏭️  Agent not mentioned in comment ${commentData.id}`);
        res.json({ received: true });
        return;
      }

      console.log(`🎯 Agent mentioned in comment ${commentData.id} by ${commentData.user?.name || 'Unknown User'}`);

      // Determine if we should create a session
      const shouldCreateSession = this.shouldCreateSession(commentData.body);
      let response: string;

      if (shouldCreateSession) {
        console.log(`🔄 Creating session for complex request in comment ${commentData.id}`);
        
        const sessionContext = this.extractSessionContext(commentData);
        if (sessionContext) {
          response = await this.handleSessionResponse(sessionContext, commentData.body);
        } else {
          // Fall back to regular response if context extraction fails
          response = await this.generateOpenCodeResponse(
            commentData.body,
            commentData.issue.title,
            commentData.issue.identifier
          );
        }
      } else {
        // Simple request, use regular response
        response = await this.generateOpenCodeResponse(
          commentData.body,
          commentData.issue.title,
          commentData.issue.identifier
        );
      }

      await emitResponse(
        `webhook-${commentData.id}`,
        response,
        commentData.issue.id
      );

      console.log(`✅ Response sent for comment ${commentData.id}`);
      res.json({ received: true, responded: true, sessionCreated: shouldCreateSession });

    } catch (error) {
      console.error('❌ Webhook handling error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Start the webhook server
   */
  async start(): Promise<void> {
    const port = parseInt(process.env.LINEAR_WEBHOOK_PORT || '3000');

    // Initialize Linear client first
    if (!await this.initializeLinearClient()) {
      console.error('❌ Failed to initialize Linear client. Exiting.');
      process.exit(1);
    }

    this.app.listen(port, () => {
      console.log(`🚀 Linear Agent webhook server running on port ${port}`);
      console.log(`📋 Agent Configuration:`);
      console.log(`   - Name: ${this.agentName}`);
      console.log(`   - User ID: ${this.agentUserId}`);
      console.log(`   - Webhook URL: ${process.env.LINEAR_AGENT_PUBLIC_URL}/webhooks/linear-agent`);
      console.log(`   - Health Check: http://localhost:${port}/health`);
      console.log(`🔧 Session Features:`);
      console.log(`   - Session Manager: ${this.sessionManager ? 'Enabled' : 'Disabled'}`);
      console.log(`   - OpenCode Sessions: ${openCodeClient.isSessionEnabled() ? 'Enabled' : 'Disabled'}`);
    });
  }
}

// Start the server if this file is run directly
if (require.main === module) {
  const server = new LinearAgentWebhookServer();
  server.start().catch(error => {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  });
}

export default LinearAgentWebhookServer;
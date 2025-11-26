/**
 * Linear Agent Webhook Server
 * 
 * Main webhook server for handling Linear events and agent mentions.
 * Uses bot OAuth token to prevent infinite loops and integrates with OpenCode LLM.
 * 
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { LinearClient, Comment } from '@linear/sdk';
import { linearWebhookMiddleware } from '../security/signature-verification';
import { emitResponse, emitProgress, updateIssueStatus } from '../activities/activity-emitter';
import { openCodeClient } from '../integrations/opencode-client';
import OpenCodeSessionManager, { SessionContext, OpenCodeSession } from '../sessions/opencode-session-manager';
import { todoManager } from '../todos/todo-manager';
import { handleAgentSessionEvent, AgentSessionEvent, updateAgentSessionProgress } from './handlers/agent-session-handler';
//getAgentSessionStatus
import { handleCommentEvent } from './handlers/comment-handler';
import { SessionUtils } from '../sessions/session-utils';
import { AgentDetection } from './utils/agent-detection';
import { ErrorHandler } from '../utils/error-handler';

class LinearAgentWebhookServer {
  private app: express.Application;
  private linearClient: LinearClient | undefined | null= null;
  private agentUserId: string | null = null;
  private agentName: string;
  private readonly sessionManager: OpenCodeSessionManager;
  
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
   * Initialize Linear client with bot OAuth token
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
      return ErrorHandler.createFallbackResponse(comment, 'AI');
    }
  }

  /**
   * Extract TODO items from user message:  Come back to this
   */
  private async extractAndCreateTodos(
    userMessage: string,
    sessionContext: SessionContext
  ): Promise<string[]> {
    const createdTodos: string[] = [];
    
    // Look for TODO patterns in message
    if (userMessage.toLowerCase().includes('todo') || 
        userMessage.toLowerCase().includes('task') ||
        userMessage.toLowerCase().includes('create')) {
      
      const todoMatch = userMessage.match(/(?:create|make|add)\s+(?:a\s+)?(?:todo|task|item)\s+(?:to\s+)?(.+?)(?:\.|$)/i);
      if (todoMatch && todoMatch[1]) {
        const todoText = todoMatch[1].trim();
        if (todoText.length > 5) {
          const todo = await todoManager.createTodo(
            sessionContext.issueId + '_' + sessionContext.userId,
            sessionContext.issueId,
            todoText,
            `Extracted from: "${userMessage.substring(0, 100)}..."`
          );
          createdTodos.push(`📋 Created TODO: ${todo.title} (ID: ${todo.id})`);
        }
      }
    }

    return createdTodos;
  }

  /**
   * Handle session-based response
   */
  private async handleSessionResponse(
    sessionContext: SessionContext,
    commentBody: string,
    existingSession?: OpenCodeSession
  ): Promise<string> {
    try {
      console.log(`🔄 Handling session response for issue ${sessionContext.issueId}`);

      // Extract TODOs from the message
      const todoResults = await this.extractAndCreateTodos(commentBody, sessionContext);
      
      // Use existing session if provided, otherwise look for one
      let session = existingSession || this.sessionManager.getSessionByIssue(
        sessionContext.issueId,
        sessionContext.userId
      );

      if (!session) {
        // Create new session
        console.log(`🆕 Creating new session for issue ${sessionContext.issueId}`);
        session = await this.sessionManager.createSession(sessionContext, {
          timeoutMinutes: 30,
          maxMessages: 50,
          elicitationMode: true,
          priority: 'medium'
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
              opencodeSession.id
            );
            
            this.sessionManager.updateSessionStatus(session.id, 'active');
            
            // Send user message and get response
            let response = await openCodeClient.sendSessionMessage(
              opencodeSession.id,
              commentBody
            );
            
            // Update session metrics
            this.sessionManager.incrementMessageCount(session.id);
            
            // Add TODO creation results to response if any
            if (todoResults.length > 0) {
              response = `${todoResults.join('\n\n')}\n\n${response}`;
            }
            
            // Update elicitation context if enabled
            if (this.sessionManager.shouldUseElicitation(session.id)) {
              this.updateElicitationFromResponse(session.id, commentBody, response);
            }
            
            return response;

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
          // Generate response using session
          const response = await openCodeClient.generateSessionResponse(
            session,
            commentBody
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
   * Handle unified webhook events (Comment, AppUserNotification, AgentSessionEvent)
   */
  private async handleAgentSessionWebhook(event: any, res: express.Response): Promise<void> {
     try {
       console.log(`🔄 Processing webhook event: ${event.type} - ${event.action} via webhook ${event.webhookId}`);

       // Extract comment data based on event type
       let commentData: any = null;

       if (event.type === 'Comment' && event.data) {
         // Direct Comment events
         commentData = event.data;
       } else if (event.type === 'AppUserNotification' && event.notification?.comment) {
         // AppUserNotification events (agent mentions)
         commentData = event.notification.comment;
         // Add async getters to mimic Comment object structure
         commentData.user = async () => event.notification?.actor;
         commentData.issue = async () => event.notification?.issue;
       } else if (event.type === 'AgentSessionEvent' && event.agentSession?.comment) {
         // AgentSessionEvent contains richer data
         commentData = event.agentSession.comment;
         // Add async getters for AgentSession events
         commentData.user = async () => event.agentSession?.creator;
         commentData.issue = async () => event.agentSession?.issue;
       }

       if (!commentData) {
         console.log('⏭️ Event does not contain comment data, skipping response processing.');
         res.json({ received: true });
         return;
       }

       // Validate comment data structure
       if (!commentData.id) {
         console.error('❌ Comment data missing required id field');
         res.status(400).json({ error: 'Invalid comment data' });
         return;
       }

       // Immediately acknowledge the webhook to prevent timeouts
       res.json({ received: true, processing: true });

        // Asynchronously process the agent response
        this.processAgentResponse(commentData, event).catch(error => {
          console.error('❌ Async agent response processing failed:', error);
        });
     } catch (error) {
       ErrorHandler.handleWebhookError(error, event.webhookId, event.type || 'Webhook');
       // Acknowledgment already sent, so we just log the error.
     }
  }

  /**
   * Route events to unified handler
   */
  private async routeEvent(event: any): Promise<void> {
    if (event.type === 'Comment' && event.action === 'create') {
      // Handle direct Comment events
      await this.handleAgentSessionWebhook(event, { json: () => ({}) } as express.Response);
      return;
    } else if (event.type === 'AppUserNotification' && event.action === 'issueCommentMention') {
      // Handle agent mention events
      await this.handleAgentSessionWebhook(event, { json: () => ({}) } as express.Response);
      return;
    } else if (event.type === 'AgentSessionEvent') {
      // Handle AgentSession events (contain richer comment + session data)
      await this.handleAgentSessionWebhook(event, { json: () => ({}) } as express.Response);
      return;
    }

    // Skip unhandled event types
    console.log(`⏭️  Skipping unhandled event type: ${event.type}`);
  }

  /**
   * Handle incoming webhook events with proper async timing
   */
  private async handleWebhook(req: express.Request, res: express.Response): Promise<void> {
      // console.log(`📥 Webhook event details:`, {
      //   action: event.action,
      //   type: event.type,
      //   hasData: !!event.data,
      //   dataType: event.data?.type,
      //   url: event.url
      // });
    try {
      const event = req.body;
      
      if (!event) {
        console.error('❌ No webhook payload received');
        res.status(400).json({ error: 'No payload received' });
        return;
      }

      // Route events to appropriate handlers
      await this.routeEvent(event);
      res.json({ received: true });

    } catch (error) {
      ErrorHandler.handleWebhookError(error, 'unknown', 'Webhook');
      // Ensure a response is sent even on unhandled errors
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Process agent response asynchronously with streaming progress and timeout handling
   */
  private async processAgentResponse(commentData: any, event?: any): Promise<void> {
    const sessionId = `webhook-${commentData.id}`;
    let session: OpenCodeSession | null = null;
    
    try {
      // Idempotency Check: Prevent duplicate processing from concurrent webhooks
      if (this.sessionManager.isProcessing(commentData.id)) {
        console.log(`⏭️  Comment ${commentData.id} is already being processed, skipping.`);
        return;
      }
      // Mark the comment as being processed. The `finally` block ensures this is always cleaned up.
      this.sessionManager.setProcessingStatus(commentData.id, true);

      // Eagerly fetch issue and user to ensure they are available.
      const [issue, commentUser] = await Promise.all([
        commentData.issue,
        commentData.user
      ]);

      if (!issue || !commentUser) {
        console.error('❌ Failed to resolve issue or user from comment data.');
        return;
      }

      console.log(`📝 Processing comment ${commentData.id}:`, {
        user: commentUser.name,
        issue: issue.identifier,
        bodyPreview: commentData.body?.substring(0, 100) + (commentData.body?.length > 100 ? '...' : '')
      });

      if (commentUser?.id === this.agentUserId) {
        console.log(`⏭️  Skipping own comment ${commentData.id}`);
        return;
      }

      // Use consolidated agent detection to see if we should process this comment
      const shouldProcess = await AgentDetection.shouldProcessComment(
        commentData, this.agentName, this.linearClient!, this.agentUserId!
      );

      if (!shouldProcess.shouldProcess) {
        console.log(`⏭️  ${shouldProcess.reason} in comment ${commentData.id}`);
        return;
      }
      console.log(`🎯 ${shouldProcess.reason} in comment ${commentData.id} by ${commentUser?.name || 'Unknown User'}`);

      // Send immediate acknowledgment comment to prevent timeout perception
      await this.sendProgressComment(
        issue.id,
        commentData.id,
        "🔄 Processing your request...",
        sessionId
      );

      // Check if this is a help/guide request
      if (AgentDetection.isHelpRequest(commentData.body)) {
        console.log(`📚 Providing help/guide response for comment ${commentData.id}`);
        
        await this.updateProgress(sessionId, 25, "Generating help response", issue?.id);
        const response = AgentDetection.generateHelpResponse();
        
        await this.updateProgress(sessionId, 100, "Help response complete", issue?.id);
        await emitResponse(sessionId, response, issue?.id, commentData.id);

        console.log(`✅ Help response sent for comment ${commentData.id}`);
        return;
      }

      // Extract session context using consolidated utility with enhanced SDK data
      const sessionContext = await SessionUtils.extractSessionContext(commentData, event);
      
      if (!sessionContext) {
        // Fall back to regular response if context extraction fails
        await this.updateProgress(sessionId, 25, "Generating standard response", issue?.id);
        const response = await this.generateOpenCodeResponse(
          commentData.body,
          issue?.title,
          issue?.identifier
        );

        await this.updateProgress(sessionId, 100, "Response complete", issue?.id);
        await emitResponse(sessionId, response, issue?.id, commentData.id);
        return;
      }

      // Find existing session using consolidated logic
      let existingSession = SessionUtils.findExistingSession(this.sessionManager, sessionContext);
      
      await this.updateProgress(sessionId, 25, existingSession ? "Resuming session" : "Creating new session", issue?.id);
      
      let response: string;
      if (existingSession) {
        console.log(`🔄 Using existing session ${existingSession.id} (status: ${existingSession.status})`);
        session = existingSession;
        
        await this.updateProgress(sessionId, 50, "Processing with existing session", issue?.id);
        response = await this.handleSessionResponse(sessionContext, commentData.body, existingSession);
      } else {
        console.log(`🆕 Creating new session for comment ${commentData.id}`);
        
        await this.updateProgress(sessionId, 40, "Initializing new session", issue?.id);
        response = await this.handleSessionResponse(sessionContext, commentData.body);
        
        // Get the newly created session
        session = SessionUtils.findExistingSession(this.sessionManager, sessionContext);
      }

      await this.updateProgress(sessionId, 90, "Finalizing response", issue?.id);
      await emitResponse(sessionId, response, issue?.id, commentData.id);
      await this.updateProgress(sessionId, 100, "Response complete", issue?.id);

      console.log(`✅ Response sent for comment ${commentData.id}`);

    } catch (error) {
      console.error('❌ Agent response processing failed:', error);
      
      // Get issue for error handling
      const issueIdForError = (await commentData.issue)?.id;
      
      if (issueIdForError) {
        // Update progress with error state
        await this.updateProgress(sessionId, 0, "Error occurred during processing", issueIdForError);
        
        // Try to send error response to Linear
        try {
          const errorResponse = ErrorHandler.createErrorResponse(error, 'Agent Response');
          
          await emitResponse(
            `${sessionId}-error`,
            errorResponse,
            issueIdForError,
            commentData.id
          );
        } catch (emitError) {
          console.error('❌ Failed to send error response:', emitError);
        }
      }
    } finally {
      // Cleanup: Always mark the comment as no longer processing
      if (this.sessionManager.isProcessing(commentData.id)) {
        this.sessionManager.setProcessingStatus(commentData.id, false);
      }
    }
  }

  /**
   * Send progress comment to Linear issue using enhanced activity emitter
   */
  private async sendProgressComment(
    issueId: string,
    commentId: string,
    message: string,
    sessionId: string
  ): Promise<void> {
    try {
      // Use the enhanced progress emitter instead of direct comment creation
      await emitProgress(sessionId, 10, message, issueId);
      console.log(`📝 Progress comment sent: ${message}`);
    } catch (error) {
      console.error('❌ Failed to send progress comment:', error);
    }
  }

  /**
   * Update progress and notify Linear if available
   */
  private async updateProgress(
    sessionId: string,
    progress: number,
    stage: string,
    issueId?: string,
    estimatedCompletion?: string | undefined
  ): Promise<void> {
    try {
      console.log(`📊 Progress: ${progress}% - ${stage}`);
      
      // Update AgentSession progress if Linear client is available
      if (this.linearClient) {
        await updateAgentSessionProgress(
          sessionId,
          progress,
          stage,
          this.linearClient,
          estimatedCompletion
        );
      }
      
      // Update session manager if session exists
      const session = this.sessionManager.getSession(sessionId.replace('webhook-', ''));
      if (session) {
        this.sessionManager.updateSessionProgress(session.id, {
          current: progress,
          total: 100,
          stage,
          estimatedCompletion
        });
      }

      // Emit progress activity to Linear if issue ID is available
      if (issueId) {
        await emitProgress(sessionId, progress, stage, issueId, estimatedCompletion);
        
        // Update Linear issue status based on progress
        if (progress >= 100) {
          await updateIssueStatus(issueId, 'done', this.linearClient);
        } else if (progress >= 50) {
          await updateIssueStatus(issueId, 'in_progress', this.linearClient);
        }
      }
    } catch (error) {
      console.error('❌ Failed to update progress:', error);
    }
  }

  /**
   * Integrate AgentSessionEvent data with session manager
   */
  private async integrateAgentSessionEvent(event: AgentSessionEvent): Promise<void> {
    try {
      const notification = event.notification;
      if (!notification.comment) return;

      const commentId = notification.comment.id;
      const userId = notification.comment.userId;
      const issueId = notification.comment.issueId;

      // Create session context for finding existing session
      const sessionContext: SessionContext = {
        userId,
        issueId,
        issueTitle: '',
        issueDescription: '',
        userName: '',
        teamId: '',
        commentId,
        mentionText: notification.comment.body,
        createdAt: new Date().toISOString()
      };

      // Find existing session using consolidated utility
      const existingSession = SessionUtils.findExistingSession(this.sessionManager, sessionContext);

      if (existingSession) {
        // Integrate elicitation context from AgentSessionEvent
        this.sessionManager.integrateAgentSessionEvent(existingSession.id, {
          userId,
          issueId,
          eventType: notification.type,
          elicitationContext: {
            userIntent: notification.type === 'issueCommentMention' ? 'question' : 'unknown',
            confidence: 0.7,
            pendingQuestions: notification.comment.body.includes('?') ? [notification.comment.body] : []
          }
        });
      }
    } catch (error) {
      console.error('❌ Failed to integrate AgentSessionEvent:', error);
    }
  }

  /**
   * Update elicitation context based on user message and AI response
   */
  private updateElicitationFromResponse(sessionId: string, userMessage: string, aiResponse: string): void {
    const elicitationContext = this.sessionManager.getElicitationContext(sessionId);
    if (!elicitationContext) return;

    // Analyze user message for questions or clarification needs
    const hasQuestions = /[?？]/.test(userMessage);
    const needsClarification = /(unclear|uncertain|what do you mean|explain|clarify)/i.test(userMessage);
    
    if (hasQuestions || needsClarification) {
      if (elicitationContext.phase === 'initial') {
        this.sessionManager.updateElicitationPhase(sessionId, 'clarification', `User asked: ${userMessage}`);
      }
      
      // Extract questions from user message
      const questions = userMessage.split(/[.!?]/).filter(s => s.trim().includes('?')).map(s => s.trim());
      questions.forEach(q => this.sessionManager.addPendingQuestion(sessionId, q));
    }

    // Analyze AI response for questions asked to user
    const aiQuestions = aiResponse.split(/[.!?]/).filter(s => s.trim().includes('?')).map(s => s.trim());
    if (aiQuestions.length > 0 && elicitationContext.phase === 'initial') {
      this.sessionManager.updateElicitationPhase(sessionId, 'clarification', `AI asked questions: ${aiQuestions.join('; ')}`);
    }

    // Check if we're moving to planning phase
    if (/(plan|implement|create|build|develop)/i.test(userMessage) && elicitationContext.phase === 'clarification') {
      this.sessionManager.updateElicitationPhase(sessionId, 'planning', `User ready to implement: ${userMessage}`);
    }

    // Check if we're moving to implementation phase
    if (/(start|begin|proceed|go ahead)/i.test(userMessage) && elicitationContext.phase === 'planning') {
      this.sessionManager.updateElicitationPhase(sessionId, 'implementation', `User starting implementation: ${userMessage}`);
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
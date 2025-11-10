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
import OpenCodeSessionManager, { SessionContext, OpenCodeSession } from '../sessions/opencode-session-manager';
import { todoManager } from '../todos/todo-manager';
import { handleAgentSessionEvent, AgentSessionEvent } from './handlers/agent-session-handler';
import { handleCommentEvent, CommentEvent, CommentData } from './handlers/comment-handler';



// CommentData interface is now imported from handlers/comment-handler.ts

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
   * Check if comment is a reply to an agent comment (threaded reply)
   * This allows agents to respond to replies without requiring new @mentions
   */
  private isReplyToAgent(commentData: CommentData): boolean {
    // Check if comment has a parent (is a reply in a thread)
    if (!commentData.parentId) {
      return false;
    }

    // Check if there's an active session for this user and issue
    // If there's an active session, any reply in the thread should be handled
    const userSessions = Array.from(this.sessionManager.sessions.values())
      .filter(session => session.linearContext.userId === commentData.user.id)
      .filter(session => session.linearContext.issueId === commentData.issue.id)
      .filter(session => session.status === 'active');

    if (userSessions.length === 0) {
      return false;
    }

    // Additional check: verify this is actually a reply in a thread where agent participated
    // We need to check if the parent comment or any comments in this thread are from the agent
    // For now, we'll assume that if there's an active session and this is a reply (has parentId),
    // it's likely a continuation of the conversation
    console.log(`🔄 Threaded reply detected: comment ${commentData.id} has parent ${commentData.parentId} in active session`);
    
    return true;
  }

  /**
   * Check if comment is a help/guide request
   */
  private isHelpRequest(commentBody: string): boolean {
    const helpPatterns = [
      '@opencodeintegration help',
      '@opencodeintegration guide',
      '@opencodeagent help', 
      '@opencodeagent guide',
      'help',
      'guide'
    ];

    const lowerBody = commentBody.toLowerCase().trim();
    return helpPatterns.some(pattern => lowerBody === pattern || 
           lowerBody.endsWith(pattern) || 
           lowerBody.includes(pattern));
  }

  /**
   * Generate help/guide response
   */
  private generateHelpResponse(): string {
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

  /**
   * Find existing session for user with consolidated logic
   */
  private findExistingSession(sessionContext: SessionContext): OpenCodeSession | null {
    const userSessions = Array.from(this.sessionManager.sessions.values())
      .filter(session => session.linearContext.userId === sessionContext.userId)
      .filter(session => session.linearContext.issueId === sessionContext.issueId);

    // Prioritize active sessions first
    const activeSession = userSessions.find(session => session.status === 'active');
    if (activeSession) {
      return activeSession;
    }

    // Then look for completed/timeout sessions
    const inactiveSession = userSessions
      .filter(session => session.status === 'completed' || session.status === 'timeout')
      .sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime())[0];

    return inactiveSession || null;
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
   * Extract TODO items from user message
   */
  private async extractAndCreateTodos(
    userMessage: string,
    sessionContext: SessionContext
  ): Promise<string[]> {
    const createdTodos: string[] = [];
    
    // Look for TODO patterns in the message
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
    existingSession?: any
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
          elicitationMode: true, // Enable elicitation framework for better interaction
          priority: 'medium'
        });

        // Create OpenCode session if available
        if (openCodeClient.isSessionEnabled()) {
          try {
            const opencodeSession = await openCodeClient.createSession(
              sessionContext,
              commentBody // Pass the actual user message verbatim
            );
            
            this.sessionManager.linkOpenCodeSession(
              session.id,
              opencodeSession.id
            );
            
            this.sessionManager.updateSessionStatus(session.id, 'active');
            
            // Now send the actual user message and get response
            let response = await openCodeClient.sendSessionMessage(
              opencodeSession.id,
              commentBody // Send user's message verbatim
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
            
            return response; // Return the actual OpenCode response

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
          // Generate response using session (opencode serve handles message storage)
          const response = await openCodeClient.generateSessionResponse(
            session,
            commentBody // Pass user message verbatim
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
   * Handle Comment webhook events
   */
  private async handleCommentWebhook(event: any, res: express.Response): Promise<void> {
    try {
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

      // Create CommentEvent object
      const commentEvent: CommentEvent = {
        type: 'Comment',
        action: event.action || 'create',
        data: commentData,
        webhookId: event.webhookId
      };

      // Route to comment handler
      if (this.linearClient && this.agentUserId) {
        await handleCommentEvent(commentEvent, this.linearClient, this.agentUserId, this.agentName);
      }

      // Continue with existing comment processing logic
      await this.processCommentEvent(commentData, res);

    } catch (error) {
      console.error('❌ Comment webhook handling error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Handle AgentSession webhook events
   */
  private async handleAgentSessionWebhook(event: any, res: express.Response): Promise<void> {
    try {
      console.log(`🔄 Processing AgentSession event: ${event.type}`);

      // Create AgentSessionEvent object
      const agentSessionEvent: AgentSessionEvent = {
        type: 'AppUserNotification',
        appUserId: event.appUserId,
        notification: event.notification,
        webhookId: event.webhookId
      };

      // Route to agent session handler and integrate with session manager
      if (this.linearClient) {
        await handleAgentSessionEvent(agentSessionEvent, this.linearClient);
        
        // Integrate AgentSessionEvent data with existing sessions
        await this.integrateAgentSessionEvent(agentSessionEvent);
      }

      console.log(`✅ AgentSession event processed successfully`);
      res.json({ received: true });

    } catch (error) {
      console.error('❌ AgentSession webhook handling error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Process comment event with existing logic
   */
  private async processCommentEvent(commentData: CommentData, res: express.Response): Promise<void> {
    // Skip if comment is from the agent itself
    if (commentData.user?.id === this.agentUserId) {
      console.log(`⏭️  Skipping own comment ${commentData.id}`);
      res.json({ received: true });
      return;
    }

    // Check if agent is mentioned OR if this is a reply to an agent comment
    const isMentioned = commentData.body && this.isAgentMentioned(commentData.body);
    const isReplyToAgent = this.isReplyToAgent(commentData);
    
    if (!isMentioned && !isReplyToAgent) {
      console.log(`⏭️  Agent not mentioned and not a reply to agent in comment ${commentData.id}`);
      res.json({ received: true });
      return;
    }

    if (isReplyToAgent && !isMentioned) {
      console.log(`🔄 Processing threaded reply to agent in comment ${commentData.id} (parent: ${commentData.parentId})`);
    } else if (isMentioned && isReplyToAgent) {
      console.log(`🎯 Agent mentioned in threaded reply ${commentData.id} by ${commentData.user?.name || 'Unknown User'}`);
    } else {
      console.log(`🎯 Agent mentioned in comment ${commentData.id} by ${commentData.user?.name || 'Unknown User'}`);
    }

    // Immediately acknowledge webhook to prevent Linear timeout
    res.json({ received: true, processing: true });

    // Process response asynchronously to avoid blocking webhook acknowledgment
    this.processAgentResponse(commentData).catch(error => {
      console.error('❌ Async response processing failed:', error);
    });
  }

  /**
   * Handle incoming webhook events with proper async timing for elicitations
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

// Route events to appropriate handlers
        if (event.type === 'Comment') {
          // Handle Comment events
          await this.handleCommentWebhook(event, res);
          return;
        } else if (event.type === 'AppUserNotification') {
          // Handle AgentSession events
          await this.handleAgentSessionWebhook(event, res);
          return;
        }

// Skip unhandled event types
       console.log(`⏭️  Skipping unhandled event type: ${event.type}`);
       res.json({ received: true });
       return;

     } catch (error) {
       console.error('❌ Webhook handling error:', error);
       res.status(500).json({ error: 'Internal server error' });
     }
   }

   /**
    * Process agent response asynchronously with consolidated session logic
    */
   private async processAgentResponse(commentData: CommentData): Promise<void> {
     try {
       // Check if this is a help/guide request
       if (this.isHelpRequest(commentData.body)) {
         console.log(`📚 Providing help/guide response for comment ${commentData.id}`);
         const response = this.generateHelpResponse();
         
         await emitResponse(
           `webhook-${commentData.id}`,
           response,
           commentData.issue.id,
           commentData.id
         );

         console.log(`✅ Help response sent for comment ${commentData.id}`);
         return;
       }

       // Extract session context and find existing session
       const sessionContext = this.extractSessionContext(commentData);
       
       if (!sessionContext) {
         // Fall back to regular response if context extraction fails
         const response = await this.generateOpenCodeResponse(
           commentData.body,
           commentData.issue.title,
           commentData.issue.identifier
         );

         await emitResponse(
           `webhook-${commentData.id}`,
           response,
           commentData.issue.id,
           commentData.id
         );
         return;
       }

       // Find existing session using consolidated logic
       //TODO: Definitely look at cleaning this up
       let existingSession = this.findExistingSession(sessionContext);
       
       let response: string;
       if (existingSession) {
         console.log(`🔄 Using existing session ${existingSession.id} (status: ${existingSession.status})`);
         response = await this.handleSessionResponse(sessionContext, commentData.body, existingSession);
       } else {
         console.log(`🆕 Creating new session for comment ${commentData.id}`);
         response = await this.handleSessionResponse(sessionContext, commentData.body);
       }

       await emitResponse(
         `webhook-${commentData.id}`,
         response,
         commentData.issue.id,
         commentData.id
       );

       console.log(`✅ Response sent for comment ${commentData.id}`);

     } catch (error) {
       console.error('❌ Agent response processing failed:', error);
       
       // Try to send error response to Linear
       try {
         const errorResponse = `❌ Sorry, I encountered an error while processing your request: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`;
         
         await emitResponse(
           `webhook-${commentData.id}-error`,
           errorResponse,
           commentData.issue.id,
           commentData.id
         );
       
   

       // Default to creating sessions for all other mentions
       console.log(`🔄 Creating session for mention in comment ${commentData.id}`);
       
       const sessionContext = this.extractSessionContext(commentData);
       let response: string;

        if (sessionContext) {
        // Find existing session using consolidated logic
          let existingSession = this.findExistingSession(sessionContext);
          
          if (existingSession) {
            console.log(`🔄 Found existing session ${existingSession.id} (status: ${existingSession.status}), reactivating`);
            response = await this.handleSessionResponse(sessionContext, commentData.body, existingSession);
          } else {
            console.log(`🆕 No existing session found, creating new session`);
            response = await this.handleSessionResponse(sessionContext, commentData.body);
          }

         if (!existingSession) {
           // Look for any relevant session (including completed/timeout ones)
           existingSession = this.findExistingSession(
             {...sessionContext}
           );
         }

         if (existingSession) {
           console.log(`🔄 Found relevant existing session ${existingSession.id} (status: ${existingSession.status}), reactivating`);
           // Reactivate the existing session
           const reactivatedSession = this.sessionManager.reactivateSession(existingSession.id);
           if (reactivatedSession) {
             response = await this.handleSessionResponse(sessionContext, commentData.body, existingSession);
           } else {
             console.log(`⚠️  Session reactivation failed, creating new session`);
             // Reactivation failed, create new session
             response = await this.handleSessionResponse(sessionContext, commentData.body);
           }
          } else {
            console.log(`🆕 No existing session found, creating new session`);
            // Create new session
            response = await this.handleSessionResponse(sessionContext, commentData.body);
          }
        } else {
         // Fall back to regular response if context extraction fails
         response = await this.generateOpenCodeResponse(
           commentData.body,
           commentData.issue.title,
           commentData.issue.identifier
         );
       }

       await emitResponse(
         `webhook-${commentData.id}`,
         response,
         commentData.issue.id,
         commentData.id // Use the triggering comment as parent for threaded reply
       );

       console.log(`✅ Response sent for comment ${commentData.id}`);

     } catch (error) {
       console.error('❌ Agent response processing failed:', error);
     }
       // Try to send error response to Linear
       try {
         const errorResponse = `❌ Sorry, I encountered an error while processing your request: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`;
         
         await emitResponse(
           `webhook-${commentData.id}-error`,
           errorResponse,
           commentData.issue.id,
           commentData.id
         );
       } catch (emitError) {
         console.error('❌ Failed to send error response:', emitError);
       }
     }
   }

  /**
   * Integrate AgentSessionEvent data with session manager
   */
   private async integrateAgentSessionEvent(event: any): Promise<void> {
     try {
       const notification = event.notification;
       if (!notification.comment) return;

       const commentId = notification.comment.id;
       const userId = notification.comment.userId;
       const issueId = notification.comment.issueId;

       // Find existing session for this user/issue pair
       let existingSession = this.findExistingSession({
         userId,
         issueId,
         issueTitle: '',
         issueDescription: '',
         userName: '',
         teamId: '',
         commentId,
         mentionText: notification.comment.body,
         createdAt: new Date().toISOString()
       });

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
  
    * @issue JOS-150
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
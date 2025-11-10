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
   * Find relevant existing session for the user
   */
  private findRelevantSession(userId: string, issueId?: string): OpenCodeSession | null {
    const userSessions = Array.from(this.sessionManager.sessions.values())
      .filter(session => session.linearContext.userId === userId)
      .filter(session => session.status === 'completed' || session.status === 'timeout')
      .sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime());

    // Prefer sessions from the same issue
    if (issueId) {
      const sameIssueSession = userSessions.find(session => session.linearContext.issueId === issueId);
      if (sameIssueSession) {
        return sameIssueSession;
      }
    }

    // Return the most recent inactive session
    return userSessions[0] || null;
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
    commentBody: string
  ): Promise<string> {
    try {
      console.log(`🔄 Handling session response for issue ${sessionContext.issueId}`);

      // Extract TODOs from the message
      const todoResults = await this.extractAndCreateTodos(commentBody, sessionContext);
      
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
            
            // Add TODO creation results to response if any
            if (todoResults.length > 0) {
              response = `${todoResults.join('\n\n')}\n\n${response}`;
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

       // Immediately acknowledge webhook to prevent Linear timeout
       // This ensures Linear doesn't close the interaction while we process
       res.json({ received: true, processing: true });

       // Process response asynchronously to avoid blocking webhook acknowledgment
       this.processAgentResponse(commentData).catch(error => {
         console.error('❌ Async response processing failed:', error);
       });

     } catch (error) {
       console.error('❌ Webhook handling error:', error);
       res.status(500).json({ error: 'Internal server error' });
     }
   }

   /**
   * Process agent response asynchronously with proper timing synchronization
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
           commentData.id // Use the triggering comment as parent for threaded reply
         );

         console.log(`✅ Help response sent for comment ${commentData.id}`);
         return;
       }

       // Default to creating sessions for all other mentions
       console.log(`🔄 Creating session for mention in comment ${commentData.id}`);
       
       const sessionContext = this.extractSessionContext(commentData);
       let response: string;

       if (sessionContext) {
         // Check if there's an existing relevant session we can reactivate
         const existingSession = this.findRelevantSession(
           sessionContext.userId, 
           sessionContext.issueId
         );

         if (existingSession) {
           console.log(`🔄 Found relevant existing session ${existingSession.id}, reactivating`);
           // Reactivate the existing session
           const reactivatedSession = this.sessionManager.reactivateSession(existingSession.id);
           if (reactivatedSession) {
             response = await this.handleSessionResponse(sessionContext, commentData.body);
           } else {
             // Reactivation failed, create new session
             response = await this.handleSessionResponse(sessionContext, commentData.body);
           }
         } else {
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
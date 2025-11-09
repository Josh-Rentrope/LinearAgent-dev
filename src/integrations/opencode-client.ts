/**
 * OpenCode API Client
 * 
 * Client for interacting with OpenCode LLM API to generate
 * intelligent responses for Linear agent interactions.
 * Now uses native opencode serve session management for better reliability.
 * 
 * @author Joshua Rentrope <joshua@opencode.ai>
 * @issue JOS-145
 */

import { OpenCodeSession, SessionContext, SessionMessage } from '../sessions/opencode-session-manager';

interface OpenCodeError {
  errors: Array<{
    message: string;
  }>;
  success: boolean;
}

interface OpenCodeSessionResponse {
  id: string;
  projectID: string;
  directory: string;
  title: string;
  version: string;
  time: {
    created: number;
    updated: number;
  };
}

interface OpenCodeMessageResponse {
  info: {
    id: string;
    sessionID: string;
    role: 'user' | 'assistant';
    time: {
      created: number;
    };
  };
  parts: Array<{
    id: string;
    type: 'text' | 'tool' | 'file';
    text?: string;
  }>;
}

interface OpenCodeCreateMessageRequest {
  parts: Array<{
    type: 'text';
    text: string;
  }>;
  model?: {
    providerID: string;
    modelID: string;
  };
  agent?: string;
}

export class OpenCodeClient {
  private apiKey: string;
  private baseUrl: string;
  private opencodeServeUrl: string;
  private opencodeServeEnabled: boolean;

  constructor() {
    this.apiKey = process.env.OPENCODE_API_KEY || '';
    this.baseUrl = process.env.OPENCODE_API_BASE_URL || 'https://api.opencode.dev';
    this.opencodeServeUrl = process.env.OPENCODE_SERVE_URL || 'http://127.0.0.1:53998';
    this.opencodeServeEnabled = process.env.OPENCODE_SERVE_ENABLED === 'true';
    
    if (!this.apiKey) {
      console.warn('⚠️  OPENCODE_API_KEY not configured, using fallback responses');
    }
    
    if (this.opencodeServeEnabled) {
      console.log(`🔗 OpenCode Serve integration enabled at ${this.opencodeServeUrl}`);
    } else {
      console.log('📝 OpenCode Serve integration disabled, using fallback responses');
    }
  }

interface OpenCodeError {
  error: {
    message: string;
    type: string;
  };
}

interface OpenCodeSessionResponse {
  sessionId: string;
  status: 'created' | 'active' | 'completed' | 'error';
  url?: string;
  expiresAt?: string;
}

interface OpenCodeStreamResponse {
  type: 'message' | 'error' | 'complete';
  content?: string;
  messageId?: string;
  error?: string;
}

export class OpenCodeClient {
  private apiKey: string;
  private baseUrl: string;
  private sessionApiKey: string;
  private sessionBaseUrl: string;

  constructor() {
    this.apiKey = process.env.OPENCODE_API_KEY || '';
    this.baseUrl = process.env.OPENCODE_API_BASE_URL || 'https://api.opencode.dev';
    this.sessionApiKey = process.env.OPENCODE_SESSION_TOKEN || this.apiKey;
    this.sessionBaseUrl = process.env.OPENCODE_SESSION_API_URL || this.baseUrl;
    
    if (!this.apiKey) {
      console.warn('⚠️  OPENCODE_API_KEY not configured, using fallback responses');
    }
    
    if (!this.sessionApiKey) {
      console.warn('⚠️  OPENCODE_SESSION_TOKEN not configured, session features disabled');
    }
  }

  /**
   * Generate a response using OpenCode LLM
   */
  async generateResponse(prompt: string): Promise<string> {
    if (!this.apiKey) {
      return this.getFallbackResponse(prompt);
    }

    try {
      console.log('🤖 Generating OpenCode response...');
      
      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': 'Linear-Agent/1.0'
        },
        body: JSON.stringify({
          model: 'opencode-chat',
          messages: [
            {
              role: 'system',
              content: 'You are OpenCode Agent, a helpful AI assistant for developers. You are knowledgeable about software development, workflows, and best practices. Be concise, helpful, and professional.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: 300,
          temperature: 0.7,
          top_p: 0.9,
          frequency_penalty: 0.5,
          presence_penalty: 0.5
        })
      });

      if (!response.ok) {
        const errorData: OpenCodeError = await response.json().catch(() => ({}));
        throw new Error(`OpenCode API ${response.status}: ${errorData.errors?.[0]?.message || response.statusText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      
      if (!content) {
        throw new Error('No content received from OpenCode API');
      }

      console.log('✅ OpenCode response generated successfully');
      return content.trim();

    } catch (error) {
      console.error('❌ OpenCode API error:', error);
      return this.getFallbackResponse(prompt);
    }
  }

    try {
      console.log('🤖 Generating OpenCode response...');
      
      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': 'Linear-Agent/1.0'
        },
        body: JSON.stringify({
          model: 'opencode-chat',
          messages: [
            {
              role: 'system',
              content: 'You are the OpenCode Agent, a helpful AI assistant for developers. You are knowledgeable about software development, workflows, and best practices. Be concise, helpful, and professional.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: 300,
          temperature: 0.7,
          top_p: 0.9,
          frequency_penalty: 0.5,
          presence_penalty: 0.5
        })
      });

      if (!response.ok) {
        const errorData: OpenCodeError = await response.json().catch(() => ({}));
        throw new Error(`OpenCode API ${response.status}: ${errorData.error?.message || response.statusText}`);
      }

      const data: OpenCodeResponse = await response.json();
      const content = data.choices[0]?.message?.content;
      
      if (!content) {
        throw new Error('No content received from OpenCode API');
      }

      console.log('✅ OpenCode response generated successfully');
      return content.trim();

    } catch (error) {
      console.error('❌ OpenCode API error:', error);
      return this.getFallbackResponse(prompt);
    }
  }

  /**
   * Generate a contextual response for Linear mentions
   */
  async generateLinearResponse(
    userComment: string,
    issueTitle: string,
    issueIdentifier: string
  ): Promise<string> {
    const prompt = `You are the OpenCode Agent, mentioned in a Linear issue. Provide a helpful, concise response.

Context:
- Issue: ${issueIdentifier} - ${issueTitle}
- User's comment: "${userComment}"

Guidelines:
1. Acknowledge their mention briefly
2. Address their specific request or question
3. Offer relevant assistance for development tasks
4. Keep response under 150 words
5. Be friendly but professional
6. Use emojis sparingly for emphasis

Respond as if you're a helpful teammate who can assist with code, documentation, testing, or development workflows.`;

    return this.generateResponse(prompt);
  }

  /**
   * Fallback response when OpenCode API is unavailable
   */
  private getFallbackResponse(_prompt: string): string {
    console.log('🔄 Using fallback response due to API unavailability');
    
    return `Hi there! 👋 I'm the OpenCode Agent. I see you mentioned me, but I'm having trouble connecting to my AI services right now.

I'm here to help with development tasks like:
- Code review and analysis
- Documentation generation  
- Test creation and automation
- Development planning and workflow optimization

Could you try mentioning me again in a few moments? In the meantime, feel free to provide more details about what you'd like assistance with! 🚀`;
  }

  /**
   * Create a new OpenCode session using opencode serve API
   * @author Joshua Rentrope <joshua@opencode.ai>
   * @issue JOS-145
   */
  async createSession(
    linearContext: SessionContext,
    initialMessage?: string
  ): Promise<OpenCodeSessionResponse> {
    if (!this.opencodeServeEnabled) {
      throw new Error('OpenCode Serve integration is not enabled');
    }

    try {
      console.log('🔗 Creating OpenCode session via opencode serve...');
      
      const sessionData = {
        title: `Linear Issue: ${linearContext.issueTitle}`,
        parentID: null // Optional: can link to parent session if needed
      };

      const response = await fetch(`${this.opencodeServeUrl}/session`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': 'Linear-Agent/1.0'
        },
        body: JSON.stringify(sessionData)
      });

      if (!response.ok) {
        const errorData: OpenCodeError = await response.json().catch(() => ({}));
        throw new Error(`OpenCode Serve API ${response.status}: ${errorData.errors?.[0]?.message || response.statusText}`);
      }

      const data: OpenCodeSessionResponse = await response.json();
      console.log(`✅ OpenCode session created: ${data.id}`);
      
      // Send initial message if provided
      if (initialMessage && data.id) {
        await this.sendSessionMessage(data.id, initialMessage);
      }

      return data;

    } catch (error) {
      console.error('❌ OpenCode session creation failed:', error);
      throw error;
    }
  }

  /**
   * Send a message to an OpenCode session using opencode serve API
   * @author Joshua Rentrope <joshua@opencode.ai>
   * @issue JOS-145
   */
  async sendSessionMessage(
    sessionId: string,
    message: string,
    stream: boolean = false
  ): Promise<string> {
    if (!this.opencodeServeEnabled) {
      throw new Error('OpenCode Serve integration is not enabled');
    }

    try {
      console.log(`💬 Sending message to OpenCode session ${sessionId}...`);
      
      const messageData: OpenCodeCreateMessageRequest = {
        parts: [
          {
            type: 'text',
            text: message
          }
        ]
      };

      const response = await fetch(`${this.opencodeServeUrl}/session/${sessionId}/message`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': 'Linear-Agent/1.0'
        },
        body: JSON.stringify(messageData)
      });

      if (!response.ok) {
        const errorData: OpenCodeError = await response.json().catch(() => ({}));
        throw new Error(`OpenCode Serve API ${response.status}: ${errorData.errors?.[0]?.message || response.statusText}`);
      }

      const data: OpenCodeMessageResponse = await response.json();
      
      // Extract the assistant's response from the parts
      const assistantPart = data.parts.find(part => part.type === 'text' && part.text);
      const content = assistantPart?.text || data.parts[data.parts.length - 1]?.text || '';
      
      if (!content) {
        throw new Error('No content received from OpenCode session API');
      }

      console.log(`✅ Message sent to session ${sessionId}`);
      return content.trim();

    } catch (error) {
      console.error(`❌ Failed to send message to session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Get session status and details using opencode serve API
   * @author Joshua Rentrope <joshua@opencode.ai>
   * @issue JOS-145
   */
  async getSessionStatus(sessionId: string): Promise<OpenCodeSessionResponse> {
    if (!this.opencodeServeEnabled) {
      throw new Error('OpenCode Serve integration is not enabled');
    }

    try {
      const response = await fetch(`${this.opencodeServeUrl}/session/${sessionId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'User-Agent': 'Linear-Agent/1.0'
        }
      });

      if (!response.ok) {
        const errorData: OpenCodeError = await response.json().catch(() => ({}));
        throw new Error(`OpenCode Serve API ${response.status}: ${errorData.errors?.[0]?.message || response.statusText}`);
      }

      return await response.json();

    } catch (error) {
      console.error(`❌ Failed to get session status for ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Complete an OpenCode session using opencode serve API
   * @author Joshua Rentrope <joshua@opencode.ai>
   * @issue JOS-145
   */
  async completeSession(sessionId: string, reason?: string): Promise<void> {
    if (!this.opencodeServeEnabled) {
      throw new Error('OpenCode Serve integration is not enabled');
    }

    try {
      console.log(`🏁 Completing OpenCode session ${sessionId}...`);
      
      const response = await fetch(`${this.opencodeServeUrl}/session/${sessionId}/abort`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': 'Linear-Agent/1.0'
        }
      });

      if (!response.ok) {
        const errorData: OpenCodeError = await response.json().catch(() => ({}));
        throw new Error(`OpenCode Serve API ${response.status}: ${errorData.errors?.[0]?.message || response.statusText}`);
      }

      console.log(`✅ OpenCode session ${sessionId} completed`);

    } catch (error) {
      console.error(`❌ Failed to complete session ${sessionId}:`, error);
      throw error;
    }
  }



  /**
   * Generate a response using session context
   * @author Joshua Rentrope <joshua@opencode.ai>
   * @issue JOS-145
   */
  async generateSessionResponse(
    session: OpenCodeSession,
    userMessage: string
  ): Promise<string> {
    if (!session.opencodeSessionId) {
      // Fallback to regular response if no OpenCode session
      return this.generateLinearResponse(
        userMessage,
        session.linearContext.issueTitle,
        session.linearContext.issueId
      );
    }

    try {
      const response = await this.sendSessionMessage(
        session.opencodeSessionId,
        userMessage,
        false // Don't stream for now
      );

      return typeof response === 'string' ? response : 'Streaming response received';
    } catch (error) {
      console.error('❌ Session response failed, falling back to regular response:', error);
      return this.generateLinearResponse(
        userMessage,
        session.linearContext.issueTitle,
        session.linearContext.issueId
      );
    }
  }

  /**
   * Check if session features are available
   * @author Joshua Rentrope <joshua@opencode.ai>
   * @issue JOS-145
   */
  isSessionEnabled(): boolean {
    return this.opencodeServeEnabled && !!this.apiKey;
  }

  /**
   * Check if OpenCode API is available
   */
  async isHealthy(): Promise<boolean> {
    if (!this.apiKey) {
      return false;
    }

    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'User-Agent': 'Linear-Agent/1.0'
        },
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });

      return response.ok;
    } catch (error) {
      console.error('❌ OpenCode health check failed:', error);
      return false;
    }
  }

  /**
   * Check if opencode serve API is available
   * @author Joshua Rentrope <joshua@opencode.ai>
   * @issue JOS-145
   */
  async isSessionHealthy(): Promise<boolean> {
    if (!this.opencodeServeEnabled || !this.apiKey) {
      return false;
    }

    try {
      const response = await fetch(`${this.opencodeServeUrl}/health`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'User-Agent': 'Linear-Agent/1.0'
        },
        signal: AbortSignal.timeout(5000)
      });

      return response.ok;
    } catch (error) {
      console.error('❌ OpenCode serve health check failed:', error);
      return false;
    }
  }
}

export const openCodeClient = new OpenCodeClient();
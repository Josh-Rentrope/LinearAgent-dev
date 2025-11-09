/**
 * OpenCode API Client
 * 
 * Client for interacting with the OpenCode LLM API to generate
 * intelligent responses for Linear agent interactions.
 * Now supports session-based conversations with context preservation.
 */

import { OpenCodeSession, SessionContext, SessionMessage } from '../sessions/opencode-session-manager';

interface OpenCodeResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
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
   * Create a new OpenCode session
   */
  async createSession(
    linearContext: SessionContext,
    initialMessage?: string
  ): Promise<OpenCodeSessionResponse> {
    if (!this.sessionApiKey) {
      throw new Error('OpenCode session API key not configured');
    }

    try {
      console.log('🔗 Creating OpenCode session...');
      
      const sessionData = {
        title: `Linear Issue: ${linearContext.issueTitle}`,
        description: `Session for Linear issue ${linearContext.issueId}`,
        context: {
          linearIssueId: linearContext.issueId,
          linearIssueTitle: linearContext.issueTitle,
          linearIssueDescription: linearContext.issueDescription,
          linearUserId: linearContext.userId,
          linearUserName: linearContext.userName,
          linearTeamId: linearContext.teamId,
          source: 'linear-agent'
        },
        settings: {
          timeoutMinutes: 30,
          maxMessages: 50,
          enableStreaming: true
        }
      };

      const response = await fetch(`${this.sessionBaseUrl}/v1/sessions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.sessionApiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': 'Linear-Agent/1.0'
        },
        body: JSON.stringify(sessionData)
      });

      if (!response.ok) {
        const errorData: OpenCodeError = await response.json().catch(() => ({}));
        throw new Error(`OpenCode Session API ${response.status}: ${errorData.error?.message || response.statusText}`);
      }

      const data: OpenCodeSessionResponse = await response.json();
      console.log(`✅ OpenCode session created: ${data.sessionId}`);
      
      // Send initial message if provided
      if (initialMessage && data.sessionId) {
        await this.sendSessionMessage(data.sessionId, initialMessage);
      }

      return data;

    } catch (error) {
      console.error('❌ OpenCode session creation failed:', error);
      throw error;
    }
  }

  /**
   * Send a message to an OpenCode session
   */
  async sendSessionMessage(
    sessionId: string,
    message: string,
    stream: boolean = false
  ): Promise<string | AsyncIterable<OpenCodeStreamResponse>> {
    if (!this.sessionApiKey) {
      throw new Error('OpenCode session API key not configured');
    }

    try {
      console.log(`💬 Sending message to OpenCode session ${sessionId}...`);
      
      const messageData = {
        sessionId,
        message,
        stream,
        metadata: {
          source: 'linear-agent',
          timestamp: new Date().toISOString()
        }
      };

      const response = await fetch(`${this.sessionBaseUrl}/v1/sessions/${sessionId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.sessionApiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': 'Linear-Agent/1.0'
        },
        body: JSON.stringify(messageData)
      });

      if (!response.ok) {
        const errorData: OpenCodeError = await response.json().catch(() => ({}));
        throw new Error(`OpenCode Session API ${response.status}: ${errorData.error?.message || response.statusText}`);
      }

      if (stream) {
        return this.handleStreamResponse(response);
      } else {
        const data: OpenCodeResponse = await response.json();
        const content = data.choices[0]?.message?.content;
        
        if (!content) {
          throw new Error('No content received from OpenCode session API');
        }

        console.log(`✅ Message sent to session ${sessionId}`);
        return content.trim();
      }

    } catch (error) {
      console.error(`❌ Failed to send message to session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Get session status and details
   */
  async getSessionStatus(sessionId: string): Promise<OpenCodeSessionResponse> {
    if (!this.sessionApiKey) {
      throw new Error('OpenCode session API key not configured');
    }

    try {
      const response = await fetch(`${this.sessionBaseUrl}/v1/sessions/${sessionId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.sessionApiKey}`,
          'User-Agent': 'Linear-Agent/1.0'
        }
      });

      if (!response.ok) {
        const errorData: OpenCodeError = await response.json().catch(() => ({}));
        throw new Error(`OpenCode Session API ${response.status}: ${errorData.error?.message || response.statusText}`);
      }

      return await response.json();

    } catch (error) {
      console.error(`❌ Failed to get session status for ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Complete an OpenCode session
   */
  async completeSession(sessionId: string, reason?: string): Promise<void> {
    if (!this.sessionApiKey) {
      throw new Error('OpenCode session API key not configured');
    }

    try {
      console.log(`🏁 Completing OpenCode session ${sessionId}...`);
      
      const response = await fetch(`${this.sessionBaseUrl}/v1/sessions/${sessionId}/complete`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.sessionApiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': 'Linear-Agent/1.0'
        },
        body: JSON.stringify({
          reason: reason || 'Session completed from Linear agent',
          completedAt: new Date().toISOString()
        })
      });

      if (!response.ok) {
        const errorData: OpenCodeError = await response.json().catch(() => ({}));
        throw new Error(`OpenCode Session API ${response.status}: ${errorData.error?.message || response.statusText}`);
      }

      console.log(`✅ OpenCode session ${sessionId} completed`);

    } catch (error) {
      console.error(`❌ Failed to complete session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Handle streaming response from OpenCode
   */
  private async *handleStreamResponse(response: Response): AsyncIterable<OpenCodeStreamResponse> {
    if (!response.body) {
      throw new Error('No response body for streaming');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim() === '') continue;
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') return;

            try {
              const parsed = JSON.parse(data);
              yield {
                type: parsed.type || 'message',
                content: parsed.content,
                messageId: parsed.messageId,
                error: parsed.error
              };
            } catch (parseError) {
              console.warn('⚠️  Failed to parse streaming data:', data);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Generate a response using session context
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
   */
  isSessionEnabled(): boolean {
    return !!this.sessionApiKey;
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
   * Check if session API is available
   */
  async isSessionHealthy(): Promise<boolean> {
    if (!this.sessionApiKey) {
      return false;
    }

    try {
      const response = await fetch(`${this.sessionBaseUrl}/health`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.sessionApiKey}`,
          'User-Agent': 'Linear-Agent/1.0'
        },
        signal: AbortSignal.timeout(5000)
      });

      return response.ok;
    } catch (error) {
      console.error('❌ OpenCode session health check failed:', error);
      return false;
    }
  }
}

export const openCodeClient = new OpenCodeClient();
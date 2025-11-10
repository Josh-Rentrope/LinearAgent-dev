/**
 * OpenCode API Client
 * 
 * Client for interacting with OpenCode LLM API to generate
 * intelligent responses for Linear agent interactions.
 * Now uses native opencode serve session management for better reliability.
 * 

 */

import { OpenCodeSession, SessionContext } from '../sessions/opencode-session-manager';
import { getOpenCodeServeUrl } from '../utils/port-detector';
import { ErrorHandler } from '../utils/error-handler';

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
  private opencodeServeUrl: string | null = null;
  private opencodeServeEnabled: boolean;
  private maxRetries: number = 3;
  private retryDelay: number = 1000; // 1 second base delay
  
  // Timeout configurations
  private readonly TIMEOUTS = {
    API_REQUEST: 30000,      // 30 seconds for regular API calls
    SESSION_CREATION: 20000,  // 20 seconds for session creation
    SESSION_MESSAGE: 45000,   // 45 seconds for session messages
    HEALTH_CHECK: 5000        // 5 seconds for health checks
  } as const;

  constructor() {
    this.apiKey = process.env.OPENCODE_API_KEY || '';
    this.baseUrl = process.env.OPENCODE_API_BASE_URL || 'https://api.opencode.dev';
    this.opencodeServeEnabled = process.env.OPENCODE_SERVE_ENABLED === 'true';
    
    if (!this.apiKey) {
      console.warn('⚠️  OPENCODE_API_KEY not configured, using fallback responses');
    }
    
    if (this.opencodeServeEnabled) {
      // Initialize with placeholder, will be updated when first used
      this.opencodeServeUrl = process.env.OPENCODE_SERVE_URL || null;
      console.log(`🔗 OpenCode Serve integration enabled, will detect port dynamically`);
    } else {
      console.log('📝 OpenCode Serve integration disabled, using fallback responses');
    }
  }

  /**
   * Helper method for retry logic with exponential backoff
   */
  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    operationName: string,
    maxRetries: number = this.maxRetries
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Don't retry on certain error types
        if (lastError.message.includes('401') || 
            lastError.message.includes('403') || 
            lastError.message.includes('Unauthorized') ||
            lastError.message.includes('Forbidden')) {
          throw lastError;
        }
        
        if (attempt === maxRetries) {
          console.error(`❌ ${operationName} failed after ${maxRetries + 1} attempts:`, lastError);
          throw lastError;
        }
        
        const delay = this.retryDelay * Math.pow(2, attempt);
        console.warn(`⚠️  ${operationName} attempt ${attempt + 1} failed, retrying in ${delay}ms:`, lastError.message);
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError!;
  }





  /**
   * Get the current opencode serve URL, detecting port if needed
   */
  private async getOpenCodeServeUrl(): Promise<string> {
    if (!this.opencodeServeEnabled) {
      throw new Error('OpenCode Serve integration is not enabled');
    }
    
    // If we have a working URL, return it
    if (this.opencodeServeUrl && this.opencodeServeUrl !== 'http://127.0.0.1:53998') {
      return this.opencodeServeUrl;
    }
    
    // Detect the correct URL
    this.opencodeServeUrl = await getOpenCodeServeUrl();
    return this.opencodeServeUrl;
  }

  /**
   * Generate a response using OpenCode LLM
   */
  async generateResponse(prompt: string): Promise<string> {
    if (!this.apiKey) {
      return this.getFallbackResponse(prompt);
    }

    const operation = async () => {
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
        }),
        signal: AbortSignal.timeout(this.TIMEOUTS.API_REQUEST)
      });

      if (!response.ok) {
        const errorData: OpenCodeError = await response.json().catch(() => ({}));
        const errorMessage = `OpenCode API ${response.status}: ${errorData.errors?.[0]?.message || response.statusText}`;
        throw new Error(errorMessage);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      
      if (!content) {
        throw new Error('No content received from OpenCode API');
      }

      console.log('✅ OpenCode response generated successfully');
      return content.trim();
    };

    try {
      return await this.retryWithBackoff(operation, 'OpenCode API response generation');
    } catch (error) {
      console.error('❌ OpenCode API error after retries:', error);
      return ErrorHandler.createFallbackResponse(prompt, 'OpenCode API');
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
    const prompt = `You are OpenCode Agent, mentioned in a Linear issue. Provide a helpful, concise response.

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
    
    return `Hi there! 👋 I'm OpenCode Agent. I see you mentioned me, but I'm having trouble connecting to my AI services right now.

I'm here to help with development tasks like:
- Code review and analysis
- Documentation generation  
- Test creation and automation
- Development planning and workflow optimization

Could you try mentioning me again in a few moments? In the meantime, feel free to provide more details about what you'd like assistance with! 🚀`;
  }

  /**
   * Create a new OpenCode session using opencode serve API
  
   * @issue JOS-145
   */
  async createSession(
    linearContext: SessionContext,
    initialMessage?: string
  ): Promise<OpenCodeSessionResponse> {
    if (!this.opencodeServeEnabled) {
      throw new Error('OpenCode Serve integration is not enabled');
    }

    const operation = async () => {
      console.log('🔗 Creating OpenCode session via opencode serve...');
      
      const serveUrl = await this.getOpenCodeServeUrl();
      
      const sessionData = {
        title: `Linear Issue: ${linearContext.issueTitle}`
      };

      const response = await fetch(`${serveUrl}/session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Linear-Agent/1.0'
        },
        body: JSON.stringify(sessionData),
        signal: AbortSignal.timeout(this.TIMEOUTS.SESSION_CREATION)
      });

      if (!response.ok) {
        const errorData: OpenCodeError = await response.json().catch(() => ({}));
        throw new Error(`OpenCode Serve API ${response.status}: ${errorData.errors?.[0]?.message || response.statusText}`);
      }

      const data: OpenCodeSessionResponse = await response.json();
      console.log(`✅ OpenCode session created: ${data.id}`);
      
      // Send initial message if provided
      if (initialMessage && data.id) {
        const enhancedMessage = `Comment started from issue ${linearContext.issueId}\n\n${initialMessage}`;
        await this.sendSessionMessage(data.id, enhancedMessage);
      }

      return data;
    };

    try {
      return await this.retryWithBackoff(operation, 'OpenCode session creation', 2); // Fewer retries for session creation
    } catch (error) {
      console.error('❌ OpenCode session creation failed after retries:', error);
      throw error;
    }
  }

  /**
   * Send a message to an OpenCode session using opencode serve API
   * Enhanced with timeout handling and progress reporting for elicitations framework
  
   * @issue JOS-145, JOS-150
   */
  async sendSessionMessage(
    sessionId: string,
    message: string,
    _stream: boolean = false,
    statusCallback?: (status: string, details?: string) => void
  ): Promise<string> {
    if (!this.opencodeServeEnabled) {
      throw new Error('OpenCode Serve integration is not enabled');
    }

    const operation = async () => {
      console.log(`💬 Sending message to OpenCode session ${sessionId}...`);
      
      if (statusCallback) {
        statusCallback('Connecting to OpenCode', 'Establishing connection to AI workspace...');
      }
      
      const serveUrl = await this.getOpenCodeServeUrl();
      
      if (statusCallback) {
        statusCallback('Preparing message', 'Formatting your request for AI processing...');
      }
      
      const messageData: OpenCodeCreateMessageRequest = {
        parts: [
          {
            type: 'text',
            text: message
          }
        ]
      };

      // Add timeout to prevent hanging requests (important for elicitations timing)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.warn(`⏰ Session message timeout for ${sessionId}, aborting request`);
        if (statusCallback) {
          statusCallback('Timeout', 'Request is taking too long. Please try with a simpler request.');
        }
        controller.abort();
      }, this.TIMEOUTS.SESSION_MESSAGE); // Configurable timeout for session messages

      if (statusCallback) {
        statusCallback('Processing', 'AI is analyzing your request and generating a response...');
      }

      const response = await fetch(`${serveUrl}/session/${sessionId}/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Linear-Agent/1.0'
        },
        body: JSON.stringify(messageData),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData: OpenCodeError = await response.json().catch(() => ({}));
        throw new Error(`OpenCode Serve API ${response.status}: ${errorData.errors?.[0]?.message || response.statusText}`);
      }

      if (statusCallback) {
        statusCallback('Finalizing', 'Processing AI response and preparing output...');
      }

      const data: OpenCodeMessageResponse = await response.json();
      
      // Extract the assistant's response from the last message part
      const assistantPart = data.parts.find(part => part.type === 'text' && part.text);
      const content = assistantPart?.text || data.parts[data.parts.length - 1]?.text || '';
      
      if (!content) {
        throw new Error('No content received from OpenCode session API');
      }

      console.log(`✅ Message sent to session ${sessionId}`);
      return content.trim();
    };

    try {
      return await this.retryWithBackoff(operation, `Session message to ${sessionId}`, 2); // Fewer retries for messages
    } catch (error) {
      console.error(`❌ Failed to send message to session ${sessionId} after retries:`, error);
      
      // Handle timeout specifically for elicitations framework
      if (error instanceof Error && (error.name === 'AbortError' || error.message.includes('timeout'))) {
        throw new Error(`Session response timeout - OpenCode took too long to respond. Please try again with a simpler request.`);
      }
      
      throw error;
    }
  }

  /**
   * Get session status and details using opencode serve API
  
   * @issue JOS-145
   */
  async getSessionStatus(sessionId: string): Promise<OpenCodeSessionResponse> {
    if (!this.opencodeServeEnabled) {
      throw new Error('OpenCode Serve integration is not enabled');
    }

    try {
      const serveUrl = await this.getOpenCodeServeUrl();
      
      const response = await fetch(`${serveUrl}/session/${sessionId}`, {
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
  
   * @issue JOS-145
   */
  async completeSession(sessionId: string, _reason?: string): Promise<void> {
    if (!this.opencodeServeEnabled) {
      throw new Error('OpenCode Serve integration is not enabled');
    }

    try {
      console.log(`🏁 Completing OpenCode session ${sessionId}...`);
      
      const serveUrl = await this.getOpenCodeServeUrl();
      
      const response = await fetch(`${serveUrl}/session/${sessionId}/abort`, {
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
   * Enhanced with timeout handling for elicitations framework
  
   * @issue JOS-145, JOS-150
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
      // Add overall timeout for session response generation
      const responsePromise = this.sendSessionMessage(
        session.opencodeSessionId,
        userMessage,
        false // Don't stream for now
      );

      const timeoutPromise = new Promise<string>((_, reject) => {
        setTimeout(() => {
          reject(new Error('Session response generation timeout - please try again'));
        }, 50000); // 50 second total timeout
      });

      const response = await Promise.race([responsePromise, timeoutPromise]);

      return typeof response === 'string' ? response : 'Streaming response received';
    } catch (error) {
      console.error('❌ Session response failed, falling back to regular response:', error);
      
      // Provide user-friendly error message for timeouts
      if (error instanceof Error && error.message.includes('timeout')) {
        return `⏰ Sorry, I'm taking too long to respond. This might be due to a complex request or server issues. Please try again with a simpler request or break it into smaller parts.`;
      }
      
      return this.generateLinearResponse(
        userMessage,
        session.linearContext.issueTitle,
        session.linearContext.issueId
      );
    }
  }

  /**
   * Check if session features are available
  
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
        signal: AbortSignal.timeout(this.TIMEOUTS.HEALTH_CHECK)
      });

      return response.ok;
    } catch (error) {
      console.error('❌ OpenCode health check failed:', error);
      return false;
    }
  }

  /**
   * Check if opencode serve API is available
  
   * @issue JOS-145
   */
  async isSessionHealthy(): Promise<boolean> {
    if (!this.opencodeServeEnabled || !this.apiKey) {
      return false;
    }

    try {
      const serveUrl = await this.getOpenCodeServeUrl();
      
      const response = await fetch(`${serveUrl}/health`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'User-Agent': 'Linear-Agent/1.0'
        },
        signal: AbortSignal.timeout(this.TIMEOUTS.HEALTH_CHECK)
      });

      return response.ok;
    } catch (error) {
      console.error('❌ OpenCode serve health check failed:', error);
      return false;
    }
  }
}

export const openCodeClient = new OpenCodeClient();
/**
 * OpenCode API Client
 * 
 * Client for interacting with the OpenCode LLM API to generate
 * intelligent responses for Linear agent interactions.
 */

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

export class OpenCodeClient {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.OPENCODE_API_KEY || '';
    this.baseUrl = process.env.OPENCODE_API_BASE_URL || 'https://api.opencode.dev';
    
    if (!this.apiKey) {
      console.warn('⚠️  OPENCODE_API_KEY not configured, using fallback responses');
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
}

export const openCodeClient = new OpenCodeClient();
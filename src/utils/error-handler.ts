/**
 * Error Handler Utilities
 * 
 * Standardized error handling patterns across all modules
 * to ensure consistency and improve maintainability.
 * 
 * @issue JOS-158
 */

/**
 * Standardized error handler for consistent error management
 */
export class ErrorHandler {
  /**
   * Handle API errors with consistent logging and fallback responses
   */
  static handleApiError(error: unknown, context: string): string {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error(`❌ API Error in ${context}:`, {
      message: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });

    // Return user-friendly error message
    if (errorMessage.includes('timeout')) {
      return `⏰ Request timed out. Please try again with a simpler request.`;
    }
    
    if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
      return `🔐 Authentication failed. Please check configuration.`;
    }
    
    if (errorMessage.includes('403') || errorMessage.includes('Forbidden')) {
      return `🚫 Access denied. Please check permissions.`;
    }
    
    if (errorMessage.includes('404') || errorMessage.includes('not found')) {
      return `🔍 Resource not found. Please verify the request.`;
    }
    
    if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
      return `⏱️ Too many requests. Please wait and try again.`;
    }
    
    if (errorMessage.includes('500') || errorMessage.includes('internal server')) {
      return `🔧 Server error. Please try again in a few moments.`;
    }

    return `❌ Something went wrong: ${errorMessage}. Please try again.`;
  }

  /**
   * Handle session-specific errors
   */
  static handleSessionError(error: unknown, sessionId: string, context: string): void {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error(`❌ Session Error in ${context} (${sessionId}):`, {
      message: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });

    // Additional session-specific error handling can be added here
    // For now, we log the error for monitoring
  }

  /**
   * Create fallback response when services are unavailable
   */
  static createFallbackResponse(_originalMessage: string, service: string = 'AI'): string {
    const timestamp = new Date().toLocaleTimeString();
    
    return `Hi there! 👋 I'm OpenCode Agent. I see you mentioned me, but I'm having trouble connecting to my ${service} services right now.

I'm here to help with development tasks like:
- Code review and analysis
- Documentation generation  
- Test creation and automation
- Development planning and workflow optimization

Could you try mentioning me again in a few moments? In the meantime, feel free to provide more details about what you'd like assistance with! 🚀

_${timestamp} - Service temporarily unavailable_`;
  }

  /**
   * Handle webhook processing errors
   */
  static handleWebhookError(error: unknown, webhookId: string, eventType: string): void {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error(`❌ Webhook Processing Error:`, {
      webhookId,
      eventType,
      message: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });

    // Don't throw here - webhook processing errors shouldn't break the main flow
  }

  /**
   * Handle Linear API errors specifically
   */
  static handleLinearApiError(error: unknown, operation: string): string {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error(`❌ Linear API Error in ${operation}:`, {
      message: errorMessage,
      timestamp: new Date().toISOString()
    });

    if (errorMessage.includes('Parent comment must be a top level comment')) {
      return `⚠️ Could not create threaded reply. Creating top-level comment instead.`;
    }
    
    if (errorMessage.includes('Comment not found')) {
      return `🔍 Comment not found. It may have been deleted.`;
    }
    
    if (errorMessage.includes('Issue not found')) {
      return `🔍 Issue not found. Please verify the issue ID.`;
    }

    return this.handleApiError(error, `Linear API - ${operation}`);
  }

  /**
   * Handle OpenCode API errors specifically
   */
  static handleOpenCodeApiError(error: unknown, operation: string): string {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error(`❌ OpenCode API Error in ${operation}:`, {
      message: errorMessage,
      timestamp: new Date().toISOString()
    });

    if (errorMessage.includes('session') && errorMessage.includes('not found')) {
      return `🔄 Session expired. Creating new session for your request.`;
    }
    
    if (errorMessage.includes('quota') || errorMessage.includes('limit')) {
      return `📊 Service quota exceeded. Please try again later.`;
    }

    return this.handleApiError(error, `OpenCode API - ${operation}`);
  }

  /**
   * Create error response for Linear comments
   */
  static createErrorResponse(error: unknown, context: string): string {
    const userMessage = this.handleApiError(error, context);
    const timestamp = new Date().toLocaleTimeString();
    
    return `${userMessage}

_${timestamp} - Error ID: ${this.generateErrorId()}_`;
  }

  /**
   * Generate unique error ID for tracking
   */
  private static generateErrorId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `ERR_${timestamp}_${random}`;
  }

  /**
   * Log performance warnings
   */
  static logPerformanceWarning(operation: string, duration: number, threshold: number = 5000): void {
    if (duration > threshold) {
      console.warn(`⚠️ Performance Warning: ${operation} took ${duration}ms (threshold: ${threshold}ms)`, {
        operation,
        duration,
        threshold,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Validate error object and extract meaningful information
   */
  static parseError(error: unknown): {
    message: string;
    stack?: string;
    code?: string | number;
    isNetworkError: boolean;
    isTimeoutError: boolean;
  } {
    const result: {
      message: string;
      stack?: string;
      code?: string | number;
      isNetworkError: boolean;
      isTimeoutError: boolean;
    } = {
      message: 'Unknown error',
      isNetworkError: false,
      isTimeoutError: false
    };

    if (error instanceof Error) {
      result.message = error.message;
      if (error.stack) {
        result.stack = error.stack;
      }
      result.isNetworkError = error.message.includes('network') || error.message.includes('fetch');
      result.isTimeoutError = error.message.includes('timeout') || error.name === 'AbortError';
    } else if (typeof error === 'string') {
      result.message = error;
      result.isNetworkError = error.includes('network') || error.includes('fetch');
      result.isTimeoutError = error.includes('timeout');
    }

    return result;
  }
}
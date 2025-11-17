/**
 * Agent Integration Tests
 * 
 * Tests for error handler and other agent utilities
 */

import { describe, it, expect } from '@jest/globals';
import { ErrorHandler } from '../src/utils/error-handler';

describe('ErrorHandler', () => {
  it('should handle API errors correctly', () => {
    const error = new Error('Request timeout');
    const result = ErrorHandler.handleApiError(error, 'test-operation');
    
    expect(result).toContain('⏰ Request timed out');
  });

  it('should create fallback responses', () => {
    const response = ErrorHandler.createFallbackResponse('test message', 'Test Service');
    
    expect(response).toContain('OpenCode Agent');
    expect(response).toContain('Test Service');
  });

  it('should parse error objects correctly', () => {
    const error = new Error('Network error');
    const parsed = ErrorHandler.parseError(error);
    
    expect(parsed.message).toBe('Network error');
    expect(parsed.isNetworkError).toBe(true);
    expect(parsed.isTimeoutError).toBe(false);
  });
});
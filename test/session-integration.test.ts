/**
 * Session Integration Tests
 * 
 * Integration tests for webhook server + session manager integration
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import LinearAgentWebhookServer from '../src/webhooks/agent-webhook-server';
import SessionConfiguration from '../src/sessions/session-config';

// Mock dependencies
jest.mock('../src/integrations/opencode-client');
jest.mock('../src/activities/activity-emitter');

import { openCodeClient } from '../src/integrations/opencode-client';
import { emitResponse } from '../src/activities/activity-emitter';

// Mock environment variables
const originalEnv = process.env;

describe('Session Integration Tests', () => {
  let server: LinearAgentWebhookServer;
  let app: express.Application;

  beforeEach(() => {
    // Reset environment
    process.env = { ...originalEnv };
    
    // Set up test environment
    process.env.LINEAR_BOT_OAUTH_TOKEN = 'test-bot-token';
    process.env.LINEAR_AGENT_NAME = 'Test Agent';
    process.env.ENABLE_SESSIONS = 'true';
    process.env.OPENCODE_SESSION_TOKEN = 'test-session-token';
    process.env.SESSION_TIMEOUT_MINUTES = '30';
    process.env.SESSION_MAX_MESSAGES = '50';
    
    // Reset configuration
    SessionConfiguration.reset();
    
    // Mock OpenCode client
    (openCodeClient.isSessionEnabled as jest.Mock).mockReturnValue(true);
    (openCodeClient.createSession as jest.Mock).mockResolvedValue({
      sessionId: 'test-opencode-session-123',
      status: 'created',
      url: 'https://opencode.dev/sessions/test-opencode-session-123'
    });
    (openCodeClient.generateSessionResponse as jest.Mock).mockResolvedValue(
      'This is a test session response'
    );
    (openCodeClient.generateLinearResponse as jest.Mock).mockResolvedValue(
      'This is a test regular response'
    );
    
    // Mock emitResponse
    (emitResponse as jest.Mock).mockResolvedValue(undefined);
    
    server = new LinearAgentWebhookServer();
    
    // Get the Express app for testing
    app = (server as any).app;
  });

  afterEach(() => {
    process.env = originalEnv;
    SessionConfiguration.reset();
    jest.clearAllMocks();
  });

  describe('Session Creation Triggers', () => {
    it('should create session for help request', async () => {
      const webhookPayload = {
        type: 'Comment',
        data: {
          id: 'comment-123',
          body: '@opencodeagent help me implement this feature',
          user: {
            id: 'user-456',
            name: 'Test User'
          },
          issue: {
            id: 'issue-789',
            identifier: 'TEST-123',
            title: 'Test Issue'
          }
        },
        createdAt: '2025-11-09T20:00:00Z'
      };

      const response = await request(app)
        .post('/webhooks/linear-agent')
        .send(webhookPayload)
        .expect(200);

      expect(response.body.received).toBe(true);
      expect(response.body.sessionCreated).toBe(true);
      expect(openCodeClient.createSession).toHaveBeenCalled();
      expect(emitResponse).toHaveBeenCalledWith(
        expect.stringContaining('webhook-comment-123'),
        expect.stringContaining('Session Started'),
        'issue-789'
      );
    });

    it('should create session for implement request', async () => {
      const webhookPayload = {
        type: 'Comment',
        data: {
          id: 'comment-456',
          body: '@opencodeagent can you implement a new API endpoint',
          user: {
            id: 'user-789',
            name: 'Developer User'
          },
          issue: {
            id: 'issue-999',
            identifier: 'TEST-456',
            title: 'API Development'
          }
        },
        createdAt: '2025-11-09T20:00:00Z'
      };

      const response = await request(app)
        .post('/webhooks/linear-agent')
        .send(webhookPayload)
        .expect(200);

      expect(response.body.sessionCreated).toBe(true);
      expect(openCodeClient.createSession).toHaveBeenCalled();
    });

    it('should create session for long comments', async () => {
      const longComment = '@opencodeagent '.repeat(50) + 'This is a very long comment that should trigger session creation because it exceeds the 200 character limit for simple responses and requires more detailed assistance with context preservation across multiple interactions.';
      
      const webhookPayload = {
        type: 'Comment',
        data: {
          id: 'comment-789',
          body: longComment,
          user: {
            id: 'user-111',
            name: 'Verbose User'
          },
          issue: {
            id: 'issue-222',
            identifier: 'TEST-789',
            title: 'Complex Issue'
          }
        },
        createdAt: '2025-11-09T20:00:00Z'
      };

      const response = await request(app)
        .post('/webhooks/linear-agent')
        .send(webhookPayload)
        .expect(200);

      expect(response.body.sessionCreated).toBe(true);
    });

    it('should not create session for simple mention', async () => {
      const webhookPayload = {
        type: 'Comment',
        data: {
          id: 'comment-simple',
          body: '@opencodeagent thanks for the help',
          user: {
            id: 'user-simple',
            name: 'Simple User'
          },
          issue: {
            id: 'issue-simple',
            identifier: 'TEST-SIMPLE',
            title: 'Simple Issue'
          }
        },
        createdAt: '2025-11-09T20:00:00Z'
      };

      const response = await request(app)
        .post('/webhooks/linear-agent')
        .send(webhookPayload)
        .expect(200);

      expect(response.body.sessionCreated).toBe(false);
      expect(openCodeClient.createSession).not.toHaveBeenCalled();
      expect(openCodeClient.generateLinearResponse).toHaveBeenCalled();
    });
  });

  describe('Session Context Handling', () => {
    it('should extract correct session context', async () => {
      const webhookPayload = {
        type: 'Comment',
        data: {
          id: 'comment-context',
          body: '@opencodeagent help me debug this issue',
          user: {
            id: 'user-context',
            name: 'Context User'
          },
          issue: {
            id: 'issue-context',
            identifier: 'TEST-CTX',
            title: 'Context Issue Test'
          }
        },
        createdAt: '2025-11-09T20:00:00Z'
      };

      await request(app)
        .post('/webhooks/linear-agent')
        .send(webhookPayload)
        .expect(200);

      expect(openCodeClient.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          issueId: 'issue-context',
          issueTitle: 'Context Issue Test',
          userId: 'user-context',
          userName: 'Context User',
          commentId: 'comment-context',
          mentionText: '@opencodeagent help me debug this issue'
        }),
        '@opencodeagent help me debug this issue'
      );
    });
  });

  describe('Session Error Handling', () => {
    it('should fallback to regular response when session creation fails', async () => {
      // Mock session creation failure
      (openCodeClient.createSession as jest.Mock).mockRejectedValueOnce(
        new Error('Session API unavailable')
      );

      const webhookPayload = {
        type: 'Comment',
        data: {
          id: 'comment-error',
          body: '@opencodeagent help me with session error',
          user: {
            id: 'user-error',
            name: 'Error User'
          },
          issue: {
            id: 'issue-error',
            identifier: 'TEST-ERR',
            title: 'Error Test Issue'
          }
        },
        createdAt: '2025-11-09T20:00:00Z'
      };

      const response = await request(app)
        .post('/webhooks/linear-agent')
        .send(webhookPayload)
        .expect(200);

      expect(openCodeClient.createSession).toHaveBeenCalled();
      expect(openCodeClient.generateLinearResponse).toHaveBeenCalled();
      expect(emitResponse).toHaveBeenCalled();
    });

    it('should handle missing session token gracefully', async () => {
      // Mock session disabled
      (openCodeClient.isSessionEnabled as jest.Mock).mockReturnValue(false);

      const webhookPayload = {
        type: 'Comment',
        data: {
          id: 'comment-no-token',
          body: '@opencodeagent help me without session token',
          user: {
            id: 'user-no-token',
            name: 'No Token User'
          },
          issue: {
            id: 'issue-no-token',
            identifier: 'TEST-NOTOKEN',
            title: 'No Token Issue'
          }
        },
        createdAt: '2025-11-09T20:00:00Z'
      };

      const response = await request(app)
        .post('/webhooks/linear-agent')
        .send(webhookPayload)
        .expect(200);

      expect(openCodeClient.createSession).not.toHaveBeenCalled();
      expect(openCodeClient.generateLinearResponse).toHaveBeenCalled();
    });
  });

  describe('Session Response Handling', () => {
    it('should use session response for existing sessions', async () => {
      // First, create a session
      const webhookPayload1 = {
        type: 'Comment',
        data: {
          id: 'comment-first',
          body: '@opencodeagent help me start a session',
          user: {
            id: 'user-session',
            name: 'Session User'
          },
          issue: {
            id: 'issue-session',
            identifier: 'TEST-SES',
            title: 'Session Issue'
          }
        },
        createdAt: '2025-11-09T20:00:00Z'
      };

      await request(app)
        .post('/webhooks/linear-agent')
        .send(webhookPayload1)
        .expect(200);

      // Reset mocks
      jest.clearAllMocks();

      // Second comment in same session
      const webhookPayload2 = {
        type: 'Comment',
        data: {
          id: 'comment-second',
          body: '@opencodeagent now continue helping me',
          user: {
            id: 'user-session',
            name: 'Session User'
          },
          issue: {
            id: 'issue-session',
            identifier: 'TEST-SES',
            title: 'Session Issue'
          }
        },
        createdAt: '2025-11-09T20:01:00Z'
      };

      await request(app)
        .post('/webhooks/linear-agent')
        .send(webhookPayload2)
        .expect(200);

      expect(openCodeClient.generateSessionResponse).toHaveBeenCalled();
      expect(openCodeClient.createSession).not.toHaveBeenCalled();
    });
  });

  describe('Health Check', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toEqual({
        status: 'healthy',
        agent: 'Test Agent',
        timestamp: expect.any(String)
      });
    });
  });

  describe('Webhook Validation', () => {
    it('should reject non-Comment events', async () => {
      const webhookPayload = {
        type: 'Issue',
        data: {
          id: 'issue-123',
          title: 'Non-Comment Event'
        }
      };

      const response = await request(app)
        .post('/webhooks/linear-agent')
        .send(webhookPayload)
        .expect(200);

      expect(response.body.received).toBe(true);
      expect(openCodeClient.createSession).not.toHaveBeenCalled();
    });

    it('should handle missing data gracefully', async () => {
      const webhookPayload = {
        type: 'Comment'
        // No data field
      };

      const response = await request(app)
        .post('/webhooks/linear-agent')
        .send(webhookPayload)
        .expect(200);

      expect(response.body.received).toBe(true);
      expect(openCodeClient.createSession).not.toHaveBeenCalled();
    });

    it('should reject empty payload', async () => {
      const response = await request(app)
        .post('/webhooks/linear-agent')
        .send({})
        .expect(400);

      expect(response.body.error).toBe('No payload received');
    });
  });
});
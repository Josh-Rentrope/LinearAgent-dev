/**
 * Session Manager Tests
 * 
 * Unit tests for OpenCode session management functionality
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import OpenCodeSessionManager, { SessionContext, OpenCodeSession } from '../src/sessions/opencode-session-manager';
import SessionConfiguration from '../src/sessions/session-config';

// Mock environment variables
const originalEnv = process.env;

describe('OpenCodeSessionManager', () => {
  let sessionManager: OpenCodeSessionManager;
  let mockContext: SessionContext;

  beforeEach(() => {
    // Reset environment
    process.env = { ...originalEnv };
    
    // Set up test environment
    process.env.ENABLE_SESSIONS = 'true';
    process.env.SESSION_TIMEOUT_MINUTES = '30';
    process.env.SESSION_MAX_MESSAGES = '50';
    
    // Reset configuration
    SessionConfiguration.reset();
    
    sessionManager = new OpenCodeSessionManager();
    
    mockContext = {
      issueId: 'test-issue-123',
      issueTitle: 'Test Issue',
      issueDescription: 'This is a test issue',
      userId: 'test-user-456',
      userName: 'Test User',
      teamId: 'test-team-789',
      commentId: 'test-comment-999',
      mentionText: '@opencodeagent help me implement this feature',
      createdAt: '2025-11-09T20:00:00Z'
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    SessionConfiguration.reset();
    sessionManager.stopCleanupInterval();
  });

  describe('Session Creation', () => {
    it('should create a new session successfully', async () => {
      const session = await sessionManager.createSession(mockContext);
      
      expect(session).toBeDefined();
      expect(session.id).toContain('session_test-issue-123_test-user-456_');
      expect(session.linearContext).toEqual(mockContext);
      expect(session.status).toBe('creating');
      expect(session.messages).toEqual([]);
      expect(session.metadata.timeoutMinutes).toBe(30);
      expect(session.metadata.maxMessages).toBe(50);
    });

    it('should create session with custom options', async () => {
      const options = {
        timeoutMinutes: 60,
        maxMessages: 100,
        initialContext: 'Custom context'
      };
      
      const session = await sessionManager.createSession(mockContext, options);
      
      expect(session.metadata.timeoutMinutes).toBe(60);
      expect(session.metadata.maxMessages).toBe(100);
    });

    it('should generate unique session IDs', async () => {
      const session1 = await sessionManager.createSession(mockContext);
      const session2 = await sessionManager.createSession(mockContext);
      
      expect(session1.id).not.toBe(session2.id);
    });
  });

  describe('Session Retrieval', () => {
    it('should retrieve session by ID', async () => {
      const createdSession = await sessionManager.createSession(mockContext);
      const retrievedSession = sessionManager.getSession(createdSession.id);
      
      expect(retrievedSession).toEqual(createdSession);
    });

    it('should return null for non-existent session', () => {
      const session = sessionManager.getSession('non-existent-id');
      expect(session).toBeNull();
    });

    it('should retrieve session by issue and user', async () => {
      const createdSession = await sessionManager.createSession(mockContext);
      const retrievedSession = sessionManager.getSessionByIssue(
        mockContext.issueId,
        mockContext.userId
      );
      
      expect(retrievedSession).toEqual(createdSession);
    });
  });

  describe('Session Status Management', () => {
    it('should update session status', async () => {
      const session = await sessionManager.createSession(mockContext);
      
      sessionManager.updateSessionStatus(session.id, 'active');
      const updatedSession = sessionManager.getSession(session.id);
      
      expect(updatedSession?.status).toBe('active');
    });

    it('should complete session', async () => {
      const session = await sessionManager.createSession(mockContext);
      
      sessionManager.completeSession(session.id, 'Task completed');
      const completedSession = sessionManager.getSession(session.id);
      
      expect(completedSession?.status).toBe('completed');
      expect(completedSession?.messages).toContainEqual(
        expect.objectContaining({
          type: 'system',
          content: 'Session completed: Task completed'
        })
      );
    });
  });

  describe('Message Management', () => {
    it('should add messages to session', async () => {
      const session = await sessionManager.createSession(mockContext);
      
      sessionManager.addMessage(session.id, 'user', 'Hello, I need help');
      sessionManager.addMessage(session.id, 'assistant', 'I can help you with that');
      
      const updatedSession = sessionManager.getSession(session.id);
      
      expect(updatedSession?.messages).toHaveLength(2);
      expect(updatedSession?.messages[0]).toEqual(
        expect.objectContaining({
          type: 'user',
          content: 'Hello, I need help'
        })
      );
      expect(updatedSession?.messages[1]).toEqual(
        expect.objectContaining({
          type: 'assistant',
          content: 'I can help you with that'
        })
      );
    });

    it('should update message count', async () => {
      const session = await sessionManager.createSession(mockContext);
      
      sessionManager.addMessage(session.id, 'user', 'Test message');
      
      const updatedSession = sessionManager.getSession(session.id);
      expect(updatedSession?.metadata.currentMessages).toBe(1);
    });

    it('should handle messages with metadata', async () => {
      const session = await sessionManager.createSession(mockContext);
      const metadata = {
        linearCommentId: 'comment-123',
        opencodeMessageId: 'msg-456'
      };
      
      sessionManager.addMessage(session.id, 'user', 'Test message', metadata);
      
      const updatedSession = sessionManager.getSession(session.id);
      expect(updatedSession?.messages[0].metadata).toEqual(metadata);
    });
  });

  describe('OpenCode Session Linking', () => {
    it('should link OpenCode session ID', async () => {
      const session = await sessionManager.createSession(mockContext);
      const opencodeSessionId = 'opencode-session-123';
      
      sessionManager.linkOpenCodeSession(session.id, opencodeSessionId);
      
      const updatedSession = sessionManager.getSession(session.id);
      expect(updatedSession?.opencodeSessionId).toBe(opencodeSessionId);
    });
  });

  describe('Session Statistics', () => {
    it('should return correct statistics', async () => {
      // Create sessions with different statuses
      const session1 = await sessionManager.createSession(mockContext);
      const session2 = await sessionManager.createSession(mockContext);
      const session3 = await sessionManager.createSession(mockContext);
      
      sessionManager.updateSessionStatus(session1.id, 'active');
      sessionManager.updateSessionStatus(session2.id, 'completed');
      sessionManager.updateSessionStatus(session3.id, 'error');
      
      const stats = sessionManager.getStats();
      
      expect(stats.total).toBe(3);
      expect(stats.active).toBe(1);
      expect(stats.completed).toBe(1);
      expect(stats.error).toBe(1);
      expect(stats.timeout).toBe(0);
    });

    it('should return active sessions only', async () => {
      const session1 = await sessionManager.createSession(mockContext);
      const session2 = await sessionManager.createSession(mockContext);
      const session3 = await sessionManager.createSession(mockContext);
      
      sessionManager.updateSessionStatus(session1.id, 'active');
      sessionManager.updateSessionStatus(session2.id, 'active');
      sessionManager.updateSessionStatus(session3.id, 'completed');
      
      const activeSessions = sessionManager.getActiveSessions();
      
      expect(activeSessions).toHaveLength(2);
      expect(activeSessions.map(s => s.id)).toContain(session1.id);
      expect(activeSessions.map(s => s.id)).toContain(session2.id);
      expect(activeSessions.map(s => s.id)).not.toContain(session3.id);
    });
  });

  describe('Session Cleanup', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should timeout expired sessions', async () => {
      const session = await sessionManager.createSession(mockContext, {
        timeoutMinutes: 1 // 1 minute timeout for testing
      });
      
      // Fast-forward time by 2 minutes
      jest.advanceTimersByTime(2 * 60 * 1000);
      
      // Trigger cleanup manually
      sessionManager['cleanupExpiredSessions']();
      
      const updatedSession = sessionManager.getSession(session.id);
      expect(updatedSession?.status).toBe('timeout');
      expect(updatedSession?.messages).toContainEqual(
        expect.objectContaining({
          type: 'system',
          content: 'Session timed out after 1 minutes'
        })
      );
    });
  });

  describe('Linear Context Extraction', () => {
    it('should extract context from webhook payload', () => {
      const mockPayload = {
        type: 'Comment',
        data: {
          id: 'comment-123',
          body: '@opencodeagent help me',
          user: {
            id: 'user-456',
            name: 'Test User'
          },
          issue: {
            id: 'issue-789',
            title: 'Test Issue',
            description: 'Test description',
            team: {
              id: 'team-111'
            }
          }
        },
        createdAt: '2025-11-09T20:00:00Z'
      };

      const context = OpenCodeSessionManager.extractLinearContext(mockPayload);
      
      expect(context).toEqual({
        issueId: 'issue-789',
        issueTitle: 'Test Issue',
        issueDescription: 'Test description',
        userId: 'user-456',
        userName: 'Test User',
        teamId: 'team-111',
        commentId: 'comment-123',
        mentionText: '@opencodeagent help me',
        createdAt: '2025-11-09T20:00:00Z'
      });
    });

    it('should return null for non-comment events', () => {
      const mockPayload = {
        type: 'Issue',
        data: {}
      };

      const context = OpenCodeSessionManager.extractLinearContext(mockPayload);
      expect(context).toBeNull();
    });

    it('should handle malformed payload gracefully', () => {
      const mockPayload = {
        type: 'Comment',
        data: null
      };

      const context = OpenCodeSessionManager.extractLinearContext(mockPayload);
      expect(context).toBeNull();
    });
  });

  describe('Session Deletion', () => {
    it('should delete session', async () => {
      const session = await sessionManager.createSession(mockContext);
      
      sessionManager.deleteSession(session.id);
      
      const deletedSession = sessionManager.getSession(session.id);
      expect(deletedSession).toBeNull();
    });
  });
});
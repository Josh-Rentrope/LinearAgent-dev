/**
 * Session Manager Tests
 * 
 * Unit tests for OpenCode session management functionality
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import OpenCodeSessionManager, { SessionContext } from '../src/sessions/opencode-session-manager';
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
      expect(session.options?.timeoutMinutes).toBe(30);
      expect(session.options?.maxMessages).toBe(50);
      expect(session.messageCount).toBe(0);
    });

    it('should create session with custom options', async () => {
      const options = {
        timeoutMinutes: 60,
        maxMessages: 100,
        initialContext: 'Custom context'
      };
      
      const session = await sessionManager.createSession(mockContext, options);
      
      expect(session.options?.timeoutMinutes).toBe(60);
      expect(session.options?.maxMessages).toBe(100);
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

    it('should retrieve session by ID', async () => {
      const createdSession = await sessionManager.createSession(mockContext);
      const retrievedSession = sessionManager.getSession(createdSession.id);
      
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
      expect(completedSession?.status).toBe('completed');
    });
  });

  describe('Message Management', () => {
    it('should increment message count correctly', async () => {
      const session = await sessionManager.createSession(mockContext);
      
      sessionManager.incrementMessageCount(session.id);
      sessionManager.incrementMessageCount(session.id);
      
      const updatedSession = sessionManager.getSession(session.id);
      expect(updatedSession?.messageCount).toBe(2);
    });

    it('should handle error count correctly', async () => {
      const session = await sessionManager.createSession(mockContext);
      
      sessionManager.incrementErrorCount(session.id);
      
      const updatedSession = sessionManager.getSession(session.id);
      expect(updatedSession?.errorCount).toBe(1);
    });

    it('should track session statistics', async () => {
      const session = await sessionManager.createSession(mockContext);
      
      sessionManager.incrementMessageCount(session.id);
      sessionManager.incrementErrorCount(session.id);
      
      const stats = sessionManager.getStats();
      expect(stats.total).toBe(1);
      expect(stats.active).toBe(1);
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

    it('should track session statistics', async () => {
      const session = await sessionManager.createSession(mockContext);
      
      sessionManager.incrementMessageCount(session.id);
      sessionManager.incrementErrorCount(session.id);
      
      const stats = sessionManager.getStats();
      expect(stats.total).toBe(1);
      expect(stats.active).toBe(1);
    });
  });

  describe('Session Lifecycle', () => {
    it('should handle session lifecycle correctly', async () => {
      const session = await sessionManager.createSession(mockContext);
      
      // Test reactivation
      sessionManager.updateSessionStatus(session.id, 'completed');
      sessionManager.reactivateSession(session.id);
      
      const reactivatedSession = sessionManager.getSession(session.id);
      expect(reactivatedSession?.status).toBe('active');
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
/**
 * Session Utilities
 * 
 * Consolidated session management utilities to eliminate duplicate logic
 * across webhook handlers and improve maintainability.
 * 
 * @issue JOS-158
 */

import { OpenCodeSessionManager, OpenCodeSession, SessionContext } from '../sessions/opencode-session-manager';
import { Comment } from '@linear/sdk';

/**
 * Consolidated session utilities for consistent session management
 */
export class SessionUtils {
  /**
   * Find existing session for user with consolidated logic
   * Eliminates duplicate session finding patterns across files
   */
  static findExistingSession(
    sessionManager: OpenCodeSessionManager,
    sessionContext: SessionContext
  ): OpenCodeSession | null {
    const userSessions = Array.from(sessionManager.sessions.values())
      .filter((session): session is OpenCodeSession => session.linearContext.userId === sessionContext.userId)
      .filter(session => session.linearContext.issueId === sessionContext.issueId);

    // Prioritize active sessions first
    const activeSession = userSessions.find(session => session.status === 'active');
    if (activeSession) {
      return activeSession;
    }

    // Then look for completed/timeout sessions
    const inactiveSession = userSessions
      .filter(session => session.status === 'completed' || session.status === 'timeout')
      .sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime())[0];

    return inactiveSession || null;
  }

  /**
   * Extract session context from comment data or AgentSession event
   * Single source of truth for context extraction with enhanced SDK data
   */
  static async extractSessionContext(commentData: Comment, event?: any): Promise<SessionContext | null> {
    try {
      if (!commentData.issue || !commentData.user) {
        return null;
      }

      const issue = await commentData.issue;
      const user = await commentData.user;

      // Base context from comment data
      const baseContext: SessionContext = {
        issueId: issue.id,
        issueTitle: issue.title,
        issueDescription: issue.description || '',
        userId: user.id,
        userName: user.name,
        teamId: (issue.team as any)?.id || '',
        commentId: commentData.id,
        mentionText: commentData.body,
        createdAt: new Date().toISOString()
      };

      // Enhance context with AgentSession event data if available
      if (event?.type === 'AgentSessionEvent' && event.agentSession) {
        const session = event.agentSession;

        // Add richer context from AgentSession event
        baseContext.issueDescription = session.issue?.description || baseContext.issueDescription;
        baseContext.teamId = session.issue?.team?.id || baseContext.teamId;

        // Add AgentSession-specific metadata
        (baseContext as any).sessionId = session.id;
        (baseContext as any).sessionStatus = session.status;
        (baseContext as any).previousComments = event.previousComments || [];
        (baseContext as any).priority = session.issue?.priority;
        (baseContext as any).labels = session.issue?.labels?.nodes || [];
      }

      return baseContext;
    } catch (error) {
      console.error('❌ Error extracting session context:', error);
      return null;
    }
  }

  /**
   * Check if a session can be reactivated
   */
  static canReactivateSession(session: OpenCodeSession): boolean {
    return session.status === 'completed' || session.status === 'timeout';
  }

  /**
   * Get session statistics for monitoring
   */
  static getSessionStats(sessionManager: OpenCodeSessionManager): {
    total: number;
    active: number;
    completed: number;
    error: number;
    timeout: number;
  } {
    return sessionManager.getStats();
  }

  /**
   * Validate session context completeness
   */
  static validateSessionContext(context: SessionContext): boolean {
    return !!(
      context.issueId &&
      context.issueTitle &&
      context.userId &&
      context.userName &&
      context.commentId &&
      context.mentionText
    );
  }

  /**
   * Create session identifier for tracking
   */
  static createSessionIdentifier(issueId: string, userId: string): string {
    return `${issueId}_${userId}`;
  }

  /**
   * Check if session is approaching timeout
   */
  static isSessionNearTimeout(session: OpenCodeSession, thresholdMinutes: number = 25): boolean {
    const lastActivity = new Date(session.lastActivity);
    const now = new Date();
    const diffMinutes = (now.getTime() - lastActivity.getTime()) / (1000 * 60);
    return diffMinutes >= thresholdMinutes;
  }

  /**
   * Get session activity summary
   */
  static getSessionActivitySummary(session: OpenCodeSession): string {
    const status = session.status;
    const messageCount = session.messageCount || 0;
    const errorCount = session.errorCount || 0;
    const lastActivity = new Date(session.lastActivity).toLocaleString();

    return `Session ${session.id}: ${status} | Messages: ${messageCount} | Errors: ${errorCount} | Last: ${lastActivity}`;
  }
}
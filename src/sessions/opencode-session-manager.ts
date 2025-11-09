/**
 * Session context for Linear webhook events
 * @author Joshua Rentrope <joshua@opencode.ai>
 * @issue JOS-145
 */
export interface SessionContext {
  issueId: string
  issueTitle: string
  issueDescription: string
  userId: string
  userName: string
  teamId: string
  commentId: string
  mentionText: string
  createdAt: string
}

/**
 * Simplified session interface that maps to opencode serve sessions
 * @author Joshua Rentrope <joshua@opencode.ai>
 * @issue JOS-145
 */
export interface OpenCodeSession {
  id: string
  linearContext: SessionContext
  opencodeSessionId?: string
  status: 'creating' | 'active' | 'completed' | 'error' | 'timeout'
  createdAt: string
  lastActivity: string
}

export interface SessionCreateOptions {
  timeoutMinutes?: number
  maxMessages?: number
  initialContext?: string
}

/**
 * Simplified session manager that relies on opencode serve for storage
 * @author Joshua Rentrope <joshua@opencode.ai>
 * @issue JOS-145
 */
export class OpenCodeSessionManager {
  private sessions = new Map<string, OpenCodeSession>()
  private cleanupInterval: NodeJS.Timeout | null = null

  constructor() {
    this.startCleanupInterval()
  }

  /**
   * Create a new OpenCode session from Linear webhook context
   * Simplified to rely on opencode serve for message storage
   * @author Joshua Rentrope <joshua@opencode.ai>
   * @issue JOS-145
   */
  async createSession(
    linearContext: SessionContext,
    _options: SessionCreateOptions = {}
  ): Promise<OpenCodeSession> {
    const sessionId = this.generateSessionId(linearContext.issueId, linearContext.userId)
    
    const session: OpenCodeSession = {
      id: sessionId,
      linearContext,
      status: 'creating',
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString()
    }

    this.sessions.set(sessionId, session)
    console.log(`✅ Created session ${sessionId} for issue ${linearContext.issueId}`)
    
    return session
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): OpenCodeSession | null {
    return this.sessions.get(sessionId) || null
  }

  /**
   * Get session by Linear issue ID and user ID
   */
  getSessionByIssue(issueId: string, userId: string): OpenCodeSession | null {
    const sessionId = this.generateSessionId(issueId, userId)
    return this.sessions.get(sessionId) || null
  }

  /**
   * Update session status
   * @author Joshua Rentrope <joshua@opencode.ai>
   * @issue JOS-145
   */
  updateSessionStatus(sessionId: string, status: OpenCodeSession['status']): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.status = status
      session.lastActivity = new Date().toISOString()
      console.log(`📝 Updated session ${sessionId} status to ${status}`)
    }
  }

  /**
   * Reactivate a completed or timed-out session
   * @author Joshua Rentrope <joshua@opencode.ai>
   * @issue JOS-147
   */
  reactivateSession(sessionId: string): OpenCodeSession | null {
    const session = this.sessions.get(sessionId)
    if (session && (session.status === 'completed' || session.status === 'timeout')) {
      session.status = 'active'
      session.lastActivity = new Date().toISOString()
      console.log(`🔄 Reactivated session ${sessionId}`)
      return session
    }
    return null
  }

  /**
   * Link OpenCode session ID to our session
   * @author Joshua Rentrope <joshua@opencode.ai>
   * @issue JOS-145
   */
  linkOpenCodeSession(sessionId: string, opencodeSessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.opencodeSessionId = opencodeSessionId
      console.log(`🔗 Linked OpenCode session ${opencodeSessionId} to session ${sessionId}`)
    }
  }

  /**
   * Complete session
   * @author Joshua Rentrope <joshua@opencode.ai>
   * @issue JOS-145
   */
  completeSession(sessionId: string, reason?: string): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.status = 'completed'
      console.log(`✅ Completed session ${sessionId}${reason ? ` (${reason})` : ''}`)
    }
  }

  /**
   * Delete session
   */
  deleteSession(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      this.sessions.delete(sessionId)
      console.log(`🗑️ Deleted session ${sessionId}`)
    }
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): OpenCodeSession[] {
    return Array.from(this.sessions.values()).filter(
      session => session.status === 'active' || session.status === 'creating'
    )
  }

  /**
   * Get session statistics
   */
  getStats(): {
    total: number
    active: number
    completed: number
    error: number
    timeout: number
  } {
    const sessions = Array.from(this.sessions.values())
    
    return {
      total: sessions.length,
      active: sessions.filter(s => s.status === 'active' || s.status === 'creating').length,
      completed: sessions.filter(s => s.status === 'completed').length,
      error: sessions.filter(s => s.status === 'error').length,
      timeout: sessions.filter(s => s.status === 'timeout').length
    }
  }

  /**
   * Cleanup expired sessions
   * Simplified timeout handling (default 30 minutes)
   * @author Joshua Rentrope <joshua@opencode.ai>
   * @issue JOS-145
   */
  private cleanupExpiredSessions(): void {
    const now = new Date()
    const expiredSessions: string[] = []
    const timeoutMs = 30 * 60 * 1000 // 30 minutes default

    for (const [sessionId, session] of this.sessions.entries()) {
      const lastActivity = new Date(session.lastActivity)
      
      if (now.getTime() - lastActivity.getTime() > timeoutMs) {
        expiredSessions.push(sessionId)
      }
    }

    for (const sessionId of expiredSessions) {
      const session = this.sessions.get(sessionId)
      if (session) {
        session.status = 'timeout'
        console.log(`⏰ Session ${sessionId} timed out after 30 minutes`)
      }
    }
  }

  /**
   * Start cleanup interval
   */
  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions()
    }, 5 * 60 * 1000) // Check every 5 minutes
  }

  /**
   * Stop cleanup interval
   */
  stopCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(issueId: string, userId: string): string {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 8)
    return `session_${issueId}_${userId}_${timestamp}_${random}`
  }




}

export default OpenCodeSessionManager
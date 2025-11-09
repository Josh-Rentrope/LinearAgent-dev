import { LinearWebhookPayload } from '../webhooks/agent-webhook-server'

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

export interface OpenCodeSession {
  id: string
  linearContext: SessionContext
  opencodeSessionId?: string
  status: 'creating' | 'active' | 'completed' | 'error' | 'timeout'
  createdAt: string
  updatedAt: string
  lastActivity: string
  messages: SessionMessage[]
  metadata: {
    timeoutMinutes: number
    maxMessages: number
    currentMessages: number
  }
}

export interface SessionMessage {
  id: string
  type: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
  metadata?: {
    linearCommentId?: string
    opencodeMessageId?: string
  }
}

export interface SessionCreateOptions {
  timeoutMinutes?: number
  maxMessages?: number
  initialContext?: string
}

export class OpenCodeSessionManager {
  private sessions = new Map<string, OpenCodeSession>()
  private cleanupInterval: NodeJS.Timeout | null = null

  constructor() {
    this.startCleanupInterval()
  }

  /**
   * Create a new OpenCode session from Linear webhook context
   */
  async createSession(
    linearContext: SessionContext,
    options: SessionCreateOptions = {}
  ): Promise<OpenCodeSession> {
    const sessionId = this.generateSessionId(linearContext.issueId, linearContext.userId)
    
    const session: OpenCodeSession = {
      id: sessionId,
      linearContext,
      status: 'creating',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      messages: [],
      metadata: {
        timeoutMinutes: options.timeoutMinutes || 30,
        maxMessages: options.maxMessages || 50,
        currentMessages: 0
      }
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
   */
  updateSessionStatus(sessionId: string, status: OpenCodeSession['status']): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.status = status
      session.updatedAt = new Date().toISOString()
      session.lastActivity = new Date().toISOString()
      console.log(`📝 Updated session ${sessionId} status to ${status}`)
    }
  }

  /**
   * Add message to session
   */
  addMessage(
    sessionId: string,
    type: SessionMessage['type'],
    content: string,
    metadata?: SessionMessage['metadata']
  ): void {
    const session = this.sessions.get(sessionId)
    if (!session) return

    const message: SessionMessage = {
      id: this.generateMessageId(),
      type,
      content,
      timestamp: new Date().toISOString(),
      metadata
    }

    session.messages.push(message)
    session.metadata.currentMessages = session.messages.length
    session.updatedAt = new Date().toISOString()
    session.lastActivity = new Date().toISOString()

    console.log(`💬 Added ${type} message to session ${sessionId}`)
  }

  /**
   * Link OpenCode session ID to our session
   */
  linkOpenCodeSession(sessionId: string, opencodeSessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.opencodeSessionId = opencodeSessionId
      session.updatedAt = new Date().toISOString()
      console.log(`🔗 Linked OpenCode session ${opencodeSessionId} to session ${sessionId}`)
    }
  }

  /**
   * Complete session
   */
  completeSession(sessionId: string, reason?: string): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.status = 'completed'
      session.updatedAt = new Date().toISOString()
      
      if (reason) {
        this.addMessage(sessionId, 'system', `Session completed: ${reason}`)
      }
      
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
   */
  private cleanupExpiredSessions(): void {
    const now = new Date()
    const expiredSessions: string[] = []

    for (const [sessionId, session] of this.sessions.entries()) {
      const lastActivity = new Date(session.lastActivity)
      const timeoutMs = session.metadata.timeoutMinutes * 60 * 1000
      
      if (now.getTime() - lastActivity.getTime() > timeoutMs) {
        expiredSessions.push(sessionId)
      }
    }

    for (const sessionId of expiredSessions) {
      const session = this.sessions.get(sessionId)
      if (session) {
        session.status = 'timeout'
        this.addMessage(sessionId, 'system', `Session timed out after ${session.metadata.timeoutMinutes} minutes`)
        console.log(`⏰ Session ${sessionId} timed out`)
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

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 8)
    return `msg_${timestamp}_${random}`
  }

  /**
   * Extract Linear context from webhook payload
   */
  static extractLinearContext(payload: LinearWebhookPayload): SessionContext | null {
    try {
      if (payload.type !== 'Comment' || !payload.data) {
        return null
      }

      const comment = payload.data
      const issue = comment.issue

      if (!issue) {
        return null
      }

      return {
        issueId: issue.id,
        issueTitle: issue.title,
        issueDescription: issue.description || '',
        userId: comment.user.id,
        userName: comment.user.name,
        teamId: issue.team.id,
        commentId: comment.id,
        mentionText: comment.body,
        createdAt: payload.createdAt
      }
    } catch (error) {
      console.error('❌ Error extracting Linear context:', error)
      return null
    }
  }
}

export default OpenCodeSessionManager
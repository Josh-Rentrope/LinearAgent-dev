import { SessionConfiguration } from './session-config';

/**
 * Session context for Linear webhook events

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

 * @issue JOS-145
 */
export interface OpenCodeSession {
  id: string
  linearContext: SessionContext
  opencodeSessionId?: string
  status: 'creating' | 'active' | 'completed' | 'error' | 'timeout'
  createdAt: string
  lastActivity: string
  options?: SessionCreateOptions
  elicitationContext?: ElicitationContext | undefined
  messageCount?: number
  errorCount?: number
  progress?: {
    current: number;
    total: number;
    stage: string;
    estimatedCompletion?: string | undefined;
    lastUpdated: string;
  };
}

export interface SessionCreateOptions {
  timeoutMinutes?: number
  maxMessages?: number
  initialContext?: string | undefined
  elicitationMode?: boolean | undefined
  priority?: 'low' | 'medium' | 'high' | undefined
}

export interface ElicitationContext {
  phase: 'initial' | 'clarification' | 'planning' | 'implementation' | 'review' | 'completed'
  lastElicitation?: string
  pendingQuestions: string[]
  contextGathered: string[]
}

/**
 * Simplified session manager that relies on opencode serve for storage

 * @issue JOS-145
 */
export class OpenCodeSessionManager {
  public sessions = new Map<string, OpenCodeSession>()
  private cleanupInterval: NodeJS.Timeout | null = null
  private processingComments = new Set<string>();

  constructor() {
    this.startCleanupInterval()
  }

  /**
   * Create a new OpenCode session from Linear webhook context
   * Enhanced with elicitation framework support

   * @issue JOS-145, JOS-150
   */
  async createSession(
    linearContext: SessionContext,
    options: SessionCreateOptions = {}
  ): Promise<OpenCodeSession> {
    const sessionId = this.generateSessionId(linearContext.issueId, linearContext.userId)
    const config = SessionConfiguration.load()

    const session: OpenCodeSession = {
      id: sessionId,
      linearContext,
      status: 'creating',
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      options: {
        timeoutMinutes: options.timeoutMinutes ?? config.timeoutMinutes,
        maxMessages: options.maxMessages ?? config.maxMessages,
        initialContext: options.initialContext,
        elicitationMode: options.elicitationMode,
        priority: options.priority
      },
      messageCount: 0,
      errorCount: 0,
      elicitationContext: options.elicitationMode ? {
        phase: 'initial',
        pendingQuestions: [],
        contextGathered: []
      } : undefined
    }

    this.sessions.set(sessionId, session)
    console.log(`✅ Created session ${sessionId} for issue ${linearContext.issueId}${options.elicitationMode ? ' (elicitation mode)' : ''}`)

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
   * Check if a comment is currently being processed to prevent race conditions.
   */
  isProcessing(commentId: string): boolean {
    return this.processingComments.has(commentId);
  }

  /**
   * Set the processing status for a comment.
   * @param commentId The ID of the comment.
   * @param status The processing status (true for processing, false for done).
   */
  setProcessingStatus(commentId: string, status: boolean): void {
    if (status) {
      this.processingComments.add(commentId);
    } else {
      this.processingComments.delete(commentId);
    }
  }
  /**
   * Update session status

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
   * Update elicitation phase for session

   * @issue JOS-150
   */
  updateElicitationPhase(sessionId: string, phase: ElicitationContext['phase'], context?: string): void {
    const session = this.sessions.get(sessionId)
    if (session && session.elicitationContext) {
      session.elicitationContext.phase = phase
      session.lastActivity = new Date().toISOString()

      if (context) {
        session.elicitationContext.contextGathered.push(context)
      }

      console.log(`🔄 Updated session ${sessionId} elicitation phase to ${phase}`)
    }
  }

  /**
   * Add pending question to elicitation context

   * @issue JOS-150
   */
  addPendingQuestion(sessionId: string, question: string): void {
    const session = this.sessions.get(sessionId)
    if (session && session.elicitationContext) {
      session.elicitationContext.pendingQuestions.push(question)
      session.lastActivity = new Date().toISOString()
      console.log(`❓ Added pending question to session ${sessionId}: ${question.substring(0, 50)}...`)
    }
  }

  /**
   * Remove answered question from elicitation context

   * @issue JOS-150
   */
  removePendingQuestion(sessionId: string, questionIndex: number): void {
    const session = this.sessions.get(sessionId)
    if (session && session.elicitationContext && session.elicitationContext.pendingQuestions[questionIndex]) {
      const removed = session.elicitationContext.pendingQuestions.splice(questionIndex, 1)[0]
      session.lastActivity = new Date().toISOString()
      console.log(`✅ Removed answered question from session ${sessionId}: ${removed.substring(0, 50)}...`)
    }
  }

  /**
   * Increment message count for session

   * @issue JOS-150
   */
  incrementMessageCount(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.messageCount = (session.messageCount || 0) + 1
      session.lastActivity = new Date().toISOString()
    }
  }

  /**
   * Increment error count for session

   * @issue JOS-150
   */
  incrementErrorCount(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.errorCount = (session.errorCount || 0) + 1
      session.lastActivity = new Date().toISOString()

      // If too many errors, mark session as error
      if (session.errorCount >= 3) {
        session.status = 'error'
        console.log(`❌ Session ${sessionId} marked as error after ${session.errorCount} errors`)
      }
    }
  }

  /**
   * Check if session should use elicitation framework

   * @issue JOS-150
   */
  shouldUseElicitation(sessionId: string): boolean {
    const session = this.sessions.get(sessionId)
    return !!(session?.options?.elicitationMode && session.elicitationContext)
  }

/**
    * Get elicitation context for session

    * @issue JOS-150
    */
  getElicitationContext(sessionId: string): ElicitationContext | undefined {
    const session = this.sessions.get(sessionId)
    return session?.elicitationContext
  }

  /**
    * Integrate AgentSessionEvent data into session context

    * @issue JOS-156
    */
  integrateAgentSessionEvent(sessionId: string, eventData: {
    userId: string;
    issueId: string;
    eventType: string;
    elicitationContext?: any;
  }): void {
    const session = this.sessions.get(sessionId)
    if (!session) {
      console.log(`⚠️  Session ${sessionId} not found for AgentSessionEvent integration`)
      return
    }

    console.log(`🔄 Integrating AgentSessionEvent into session ${sessionId}:`, {
      eventType: eventData.eventType,
      hasElicitationContext: !!eventData.elicitationContext
    })

    // Update session activity
    session.lastActivity = new Date().toISOString()

    // Integrate elicitation context if available
    if (eventData.elicitationContext && session.elicitationContext) {
      // Merge user intent and confidence
      if (eventData.elicitationContext.userIntent) {
        session.elicitationContext.contextGathered.push(
          `User intent detected: ${eventData.elicitationContext.userIntent}`
        )
      }

      // Add confidence score if available
      if (eventData.elicitationContext.confidence) {
        session.elicitationContext.contextGathered.push(
          `Intent confidence: ${Math.round(eventData.elicitationContext.confidence * 100)}%`
        )
      }

      // Add pending questions from event
      if (eventData.elicitationContext.pendingQuestions) {
        eventData.elicitationContext.pendingQuestions.forEach((question :string) => {
          this.addPendingQuestion(sessionId, question)
        })
      }

      // Update elicitation phase based on event type
      this.updateElicitationPhaseFromEvent(sessionId, eventData.eventType)
    }

    console.log(`✅ AgentSessionEvent integrated into session ${sessionId}`)
  }

  /**
   * Update elicitation phase based on AgentSessionEvent type

   * @issue JOS-156
   */
  private updateElicitationPhaseFromEvent(sessionId: string, eventType: string): void {
    const session = this.sessions.get(sessionId)
    if (!session || !session.elicitationContext) return

    let newPhase: ElicitationContext['phase'] = 'initial'

    switch (eventType) {
      case 'issueCommentMention':
        newPhase = 'clarification'
        break
      case 'sessionStarted':
        newPhase = 'initial'
        break
      case 'sessionEnded':
        newPhase = 'completed'
        break
      default:
        console.log(`⚠️  Unknown AgentSessionEvent type: ${eventType}`)
        return
    }

    this.updateElicitationPhase(sessionId, newPhase, `Event: ${eventType}`)
  }

  /**
   * Update session progress tracking

   * @issue JOS-159
   */
  updateSessionProgress(sessionId: string, progress: {
    current: number;
    total: number;
    stage: string;
    estimatedCompletion?: string | undefined;
  }): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.progress = {
        ...progress,
        lastUpdated: new Date().toISOString()
      }
      session.lastActivity = new Date().toISOString()

      console.log(`📊 Updated session ${sessionId} progress: ${progress.current}/${progress.total} - ${progress.stage}`)

      // Auto-update session status based on progress
      if (progress.current >= 100 && session.status === 'active') {
        this.completeSession(sessionId, 'Progress completed')
      } else if (progress.current > 0 && session.status === 'creating') {
        this.updateSessionStatus(sessionId, 'active')
      }
    }
  }

  /**
   * Get session progress

   * @issue JOS-159
   */
  getSessionProgress(sessionId: string): {
    current: number;
    total: number;
    stage: string;
    estimatedCompletion?: string | undefined;
    lastUpdated: string;
  } | null {
    const session = this.sessions.get(sessionId)
    return session?.progress || null
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
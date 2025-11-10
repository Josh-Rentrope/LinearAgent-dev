/**
 * Session Configuration Types
 * 
 * Type definitions for session management configuration
 */

export interface SessionConfig {
  // Core session settings
  enabled: boolean;
  timeoutMinutes: number;
  maxMessages: number;
  cleanupIntervalMinutes: number;
  
  // OpenCode session settings
  opencodeSessionUrl: string;
  opencodeSessionToken: string;
  
  // Storage settings
  storageUrl: string;
  persistenceEnabled: boolean;
  
  // Feature flags
  streamingEnabled: boolean;
  autoCreateSessions: boolean;
  sessionTriggers: string[];
  
  // Performance settings
  maxConcurrentSessions: number;
  sessionCacheSize: number;
  
  // Security settings
  requireAuthentication: boolean;
  allowedUsers: string[];
  allowedTeams: string[];
}

export interface SessionEnvironmentVariables {
  // Core session variables
  ENABLE_SESSIONS: string;
  SESSION_TIMEOUT_MINUTES: string;
  SESSION_MAX_MESSAGES: string;
  SESSION_CLEANUP_INTERVAL_MINUTES: string;
  
  // OpenCode session variables
  OPENCODE_SESSION_API_URL: string;
  OPENCODE_SESSION_TOKEN: string;
  
  // Storage variables
  SESSION_STORAGE_URL: string;
  
  // Feature flag variables
  ENABLE_SESSION_MANAGEMENT: string;
  ENABLE_SESSION_STREAMING: string;
  ENABLE_SESSION_PERSISTENCE: string;
  
  // Performance variables
  MAX_CONCURRENT_SESSIONS: string;
  SESSION_CACHE_SIZE: string;
  
  // Security variables
  SESSION_REQUIRE_AUTH: string;
  SESSION_ALLOWED_USERS: string;
  SESSION_ALLOWED_TEAMS: string;
}

export class SessionConfiguration {
  private static config: SessionConfig | null = null;

  /**
   * Load session configuration from environment variables
   */
  static load(): SessionConfig {
    if (this.config) {
      return this.config;
    }

    this.config = {
      // Core session settings
      enabled: this.getEnvBool('ENABLE_SESSIONS', true),
      timeoutMinutes: this.getEnvNumber('SESSION_TIMEOUT_MINUTES', 30),
      maxMessages: this.getEnvNumber('SESSION_MAX_MESSAGES', 50),
      cleanupIntervalMinutes: this.getEnvNumber('SESSION_CLEANUP_INTERVAL_MINUTES', 5),
      
      // OpenCode session settings
      opencodeSessionUrl: process.env.OPENCODE_SESSION_API_URL || 'https://api.opencode.dev/sessions',
      opencodeSessionToken: process.env.OPENCODE_SESSION_TOKEN || '',
      
      // Storage settings
      storageUrl: process.env.SESSION_STORAGE_URL || 'redis://localhost:6379',
      persistenceEnabled: this.getEnvBool('ENABLE_SESSION_PERSISTENCE', true),
      
      // Feature flags
      streamingEnabled: this.getEnvBool('ENABLE_SESSION_STREAMING', true),
      autoCreateSessions: true, // Always auto-create for now
      sessionTriggers: [
        'help me',
        'can you help',
        'i need help',
        'assist me',
        'work on',
        'implement',
        'create',
        'build',
        'develop',
        'debug',
        'fix',
        'analyze',
        'review',
        'session',
        'start a session',
        'let\'s work',
        'let us work'
      ],
      
      // Performance settings
      maxConcurrentSessions: this.getEnvNumber('MAX_CONCURRENT_SESSIONS', 100),
      sessionCacheSize: this.getEnvNumber('SESSION_CACHE_SIZE', 1000),
      
      // Security settings
      requireAuthentication: this.getEnvBool('SESSION_REQUIRE_AUTH', false),
      allowedUsers: this.getEnvList('SESSION_ALLOWED_USERS', []),
      allowedTeams: this.getEnvList('SESSION_ALLOWED_TEAMS', [])
    };

    console.log('📋 Session Configuration Loaded:', {
      enabled: this.config.enabled,
      timeoutMinutes: this.config.timeoutMinutes,
      maxMessages: this.config.maxMessages,
      streamingEnabled: this.config.streamingEnabled,
      persistenceEnabled: this.config.persistenceEnabled,
      hasOpenCodeToken: !!this.config.opencodeSessionToken
    });

    return this.config;
  }

  /**
   * Get current session configuration
   */
  static get(): SessionConfig {
    if (!this.config) {
      return this.load();
    }
    return this.config;
  }

  /**
   * Validate session configuration
   */
  static validate(): { valid: boolean; errors: string[] } {
    const config = this.get();
    const errors: string[] = [];

    if (!config.enabled) {
      return { valid: true, errors: [] }; // Disabled is valid
    }

    if (!config.opencodeSessionToken) {
      errors.push('OPENCODE_SESSION_TOKEN is required when sessions are enabled');
    }

    if (!config.opencodeSessionUrl) {
      errors.push('OPENCODE_SESSION_API_URL is required when sessions are enabled');
    }

    if (config.timeoutMinutes <= 0) {
      errors.push('SESSION_TIMEOUT_MINUTES must be greater than 0');
    }

    if (config.maxMessages <= 0) {
      errors.push('SESSION_MAX_MESSAGES must be greater than 0');
    }

    if (config.maxConcurrentSessions <= 0) {
      errors.push('MAX_CONCURRENT_SESSIONS must be greater than 0');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get environment variable as boolean
   */
  private static getEnvBool(key: string, defaultValue: boolean): boolean {
    const value = process.env[key];
    if (value === undefined) return defaultValue;
    return value.toLowerCase() === 'true' || value === '1';
  }

  /**
   * Get environment variable as number
   */
  private static getEnvNumber(key: string, defaultValue: number): number {
    const value = process.env[key];
    if (value === undefined) return defaultValue;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  /**
   * Get environment variable as string array
   */
  private static getEnvList(key: string, defaultValue: string[]): string[] {
    const value = process.env[key];
    if (value === undefined || value === '') return defaultValue;
    return value.split(',').map(item => item.trim()).filter(item => item.length > 0);
  }

  /**
   * Get all session-related environment variables
   */
  static getEnvironmentVariables(): SessionEnvironmentVariables {
    return {
      ENABLE_SESSIONS: process.env.ENABLE_SESSIONS || 'true',
      SESSION_TIMEOUT_MINUTES: process.env.SESSION_TIMEOUT_MINUTES || '30',
      SESSION_MAX_MESSAGES: process.env.SESSION_MAX_MESSAGES || '50',
      SESSION_CLEANUP_INTERVAL_MINUTES: process.env.SESSION_CLEANUP_INTERVAL_MINUTES || '5',
      
      OPENCODE_SESSION_API_URL: process.env.OPENCODE_SESSION_API_URL || 'https://api.opencode.dev/sessions',
      OPENCODE_SESSION_TOKEN: process.env.OPENCODE_SESSION_TOKEN || '',
      
      SESSION_STORAGE_URL: process.env.SESSION_STORAGE_URL || 'redis://localhost:6379',
      
      ENABLE_SESSION_MANAGEMENT: process.env.ENABLE_SESSION_MANAGEMENT || 'true',
      ENABLE_SESSION_STREAMING: process.env.ENABLE_SESSION_STREAMING || 'true',
      ENABLE_SESSION_PERSISTENCE: process.env.ENABLE_SESSION_PERSISTENCE || 'true',
      
      MAX_CONCURRENT_SESSIONS: process.env.MAX_CONCURRENT_SESSIONS || '100',
      SESSION_CACHE_SIZE: process.env.SESSION_CACHE_SIZE || '1000',
      
      SESSION_REQUIRE_AUTH: process.env.SESSION_REQUIRE_AUTH || 'false',
      SESSION_ALLOWED_USERS: process.env.SESSION_ALLOWED_USERS || '',
      SESSION_ALLOWED_TEAMS: process.env.SESSION_ALLOWED_TEAMS || ''
    };
  }

  /**
   * Reset configuration (useful for testing)
   */
  static reset(): void {
    this.config = null;
  }
}

export default SessionConfiguration;
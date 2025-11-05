/**
 * Linear Agent OAuth Configuration
 * 
 * This module handles the OAuth configuration for the Linear Agent,
 * including required scopes, webhook setup, and security parameters.
 */

export interface LinearOAuthConfig {
  clientId: string;
  clientSecret: string;
  webhookSecret: string;
  publicUrl: string;
  requiredScopes: string[];
  webhookEvents: string[];
}

export const LINEAR_OAUTH_CONFIG: LinearOAuthConfig = {
  clientId: process.env.LINEAR_CLIENT_ID || '',
  clientSecret: process.env.LINEAR_CLIENT_SECRET || '',
  webhookSecret: process.env.LINEAR_WEBHOOK_SECRET || '',
  publicUrl: process.env.LINEAR_AGENT_PUBLIC_URL || 'http://localhost:3000',
  
  // Required scopes for Linear Agent functionality
  requiredScopes: [
    'app:assignable',    // Allow agent to be assigned to issues
    'app:mentionable',   // Allow agent to be mentioned in comments
    'issue:read',        // Read issue data and comments
    'issue:write',       // Create/update issues and comments
    'team:read',         // Read team information
    'user:read'          // Read user information for mentions
  ],
  
  // Required webhook event categories
  webhookEvents: [
    'AgentSession',       // Agent mentions and delegation events
    'InboxNotifications', // Direct agent interactions
    'PermissionChanges'   // Team access changes
  ]
};

/**
 * Validate OAuth configuration is complete
 */
export function validateOAuthConfig(): boolean {
  const config = LINEAR_OAUTH_CONFIG;
  
  return !!(
    config.clientId &&
    config.clientSecret &&
    config.webhookSecret &&
    config.publicUrl &&
    config.requiredScopes.length > 0 &&
    config.webhookEvents.length > 0
  );
}

/**
 * Get webhook endpoint URL for Linear configuration
 */
export function getWebhookEndpoint(): string {
  return `${LINEAR_OAUTH_CONFIG.publicUrl}/webhooks/linear-agent`;
}

/**
 * Get OAuth installation URL for workspace admins
 */
export function getInstallationUrl(): string {
  const baseUrl = 'https://linear.app/oauth/authorize';
  const params = new URLSearchParams({
    client_id: LINEAR_OAUTH_CONFIG.clientId,
    response_type: 'code',
    scope: LINEAR_OAUTH_CONFIG.requiredScopes.join(' '),
    actor: 'app', // Required for agent installation
    redirect_uri: `${LINEAR_OAUTH_CONFIG.publicUrl}/auth/callback`
  });
  
  return `${baseUrl}?${params.toString()}`;
}
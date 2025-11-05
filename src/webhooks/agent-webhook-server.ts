/**
 * Linear Agent Webhook Server
 * 
 * Express server for handling Linear agent webhook events
 * including agent sessions, mentions, and notifications.
 */

import express from 'express';
import { linearWebhookMiddleware, webhookRateLimiter } from '../security/signature-verification';
import { handleAgentSessionEvent } from './handlers/agent-session-handler';
import { handleInboxNotification } from './handlers/inbox-notification-handler';
import { handlePermissionChange } from './handlers/permission-change-handler';

const app = express();
const PORT = process.env.LINEAR_WEBHOOK_PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.raw({ type: 'application/json' })); // For signature verification

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Main webhook endpoint for Linear agent events
app.post('/webhooks/linear-agent', 
  linearWebhookMiddleware,
  async (req, res) => {
    // Rate limiting by IP
    const clientId = req.ip || req.connection?.remoteAddress || 'unknown';
    if (!webhookRateLimiter.isAllowed(clientId)) {
      return res.status(429).json({ error: 'Too many requests' });
    }
    
    try {
      const event = req.body;
      const eventType = event.type || event.action;
      
      console.log(`Received Linear event: ${eventType}`, {
        eventId: event.id,
        type: eventType,
        timestamp: new Date().toISOString()
      });
      
      // Route to appropriate handler based on event type
      switch (eventType) {
        case 'AgentSession.created':
        case 'AgentSession.prompted':
          try {
            await handleAgentSessionEvent(event);
            return res.json({ received: true, type: eventType });
          } catch (error) {
            console.error('AgentSession handler error:', error);
            return res.status(500).json({ error: 'Handler error' });
          }
          break;
          
        case 'InboxNotification.created':
          try {
            await handleInboxNotification(event);
            return res.json({ received: true, type: eventType });
          } catch (error) {
            console.error('InboxNotification handler error:', error);
            return res.status(500).json({ error: 'Handler error' });
          }
          break;
          
        case 'PermissionChange.created':
          try {
            await handlePermissionChange(event);
            return res.json({ received: true, type: eventType });
          } catch (error) {
            console.error('PermissionChange handler error:', error);
            return res.status(500).json({ error: 'Handler error' });
          }
          break;
          
        default:
          console.log(`Unhandled event type: ${eventType}`);
          return res.json({ received: true, type: eventType, handled: false });
      }
    } catch (error) {
      console.error('Webhook processing error:', error);
      return res.status(500).json({ error: 'Processing error' });
    }
  }
  
);

// OAuth callback endpoint
app.get('/auth/callback', (req, res) => {
  const { code, state } = req.query;
  
  // Handle OAuth callback for agent installation
  console.log('OAuth callback received:', { code: !!code, state });
  
  // TODO: Exchange code for access token
  // TODO: Store installation details
  
  res.json({ 
    message: 'Linear Agent installation successful!',
    status: 'installed'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🤖 Linear Agent webhook server running on port ${PORT}`);
  console.log(`📡 Webhook endpoint: http://localhost:${PORT}/webhooks/linear-agent`);
  console.log(`🔐 Health check: http://localhost:${PORT}/health`);
});

export default app;
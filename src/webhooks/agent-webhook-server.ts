/**
 * Linear Agent Webhook Server
 * 
 * Express server for handling Linear agent webhook events
 * including agent sessions, mentions, and notifications.
 */

import express from 'express';
import { linearWebhookMiddleware, webhookRateLimiter } from '../security/signature-verification';
import { handleAgentSessionEvent } from './handlers/agent-session-handler';
import { handleAgentSessionEvent as handleAgentSessionEventHandler } from './handlers/agent-session-event-handler';
import { handleCommentEvent } from './handlers/comment-handler';
import { handleInboxNotification } from './handlers/inbox-notification-handler';
import { handlePermissionChange } from './handlers/permission-change-handler';

const app = express();
const PORT = process.env.LINEAR_WEBHOOK_PORT || 3000;

// In-memory store to track agent user IDs from recent events
const agentUserStore = new Map<string, { agentUserId: string; timestamp: number }>();

// In-memory store to track recently processed events to prevent duplicates
const processedEvents = new Map<string, { timestamp: number; eventType: string }>();

// Clean up old entries (older than 5 minutes)
setInterval(() => {
  const now = Date.now();
  const fiveMinutes = 5 * 60 * 1000;
  
  // Clean agent user store
  for (const [_key, value] of agentUserStore.entries()) {
    if (now - value.timestamp > fiveMinutes) {
      agentUserStore.delete(_key);
    }
  }
  
  // Clean processed events store
  for (const [_key, value] of processedEvents.entries()) {
    if (now - value.timestamp > fiveMinutes) {
      processedEvents.delete(_key);
    }
  }
}, 60000); // Clean every minute

// Middleware - IMPORTANT: raw must come before json for signature verification
app.use(express.raw({ type: 'application/json' })); // For signature verification
app.use(express.json());

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
      // Parse body from Buffer if needed
      let event;
      if (req.body instanceof Buffer) {
        event = JSON.parse(req.body.toString());
      } else {
        event = req.body;
      }
      
      const eventType = event.type || event.action;
      const eventId = event.id || `${eventType}-${Date.now()}`;
      
      // Check if we've already processed this event
      const existingEvent = processedEvents.get(eventId);
      if (existingEvent && existingEvent.eventType === eventType) {
        console.log(`⏭️ Skipping duplicate event: ${eventId} (${eventType})`);
        return res.json({ received: true, type: eventType, duplicate: true });
      }
      
      // Mark this event as processed
      processedEvents.set(eventId, {
        timestamp: Date.now(),
        eventType
      });
      
      console.log(`🔔 Received Linear event: ${eventType}`, {
        eventId,
        type: eventType,
        timestamp: new Date().toISOString(),
        fullEvent: JSON.stringify(event, null, 2)
      });
      
      // Route to appropriate handler based on event type
      switch (eventType) {
        case 'AppUserNotification':
          try {
            // Store agent user ID from AppUserNotification for later use
            if (event.appUserId) {
              agentUserStore.set(event.appUserId, {
                agentUserId: event.appUserId,
                timestamp: Date.now()
              });
            }
            await handleAgentSessionEvent(event);
            return res.json({ received: true, type: eventType });
          } catch (error) {
            console.error('AppUserNotification handler error:', error);
            return res.status(500).json({ error: 'Handler error' });
          }
          break;
          
        case 'Comment':
          try {
            // Try to get agent user ID from our store or environment
            let agentUserId = process.env.LINEAR_AGENT_USER_ID;
            
            // Also try to find from recent AppUserNotification events
            if (!agentUserId) {
              for (const [key, value] of agentUserStore.entries()) {
                if (Date.now() - value.timestamp < 5 * 60 * 1000) { // 5 minutes
                  agentUserId = value.agentUserId;
                  break;
                }
              }
            }
            
            await handleCommentEvent(event, agentUserId);
            return res.json({ received: true, type: eventType });
          } catch (error) {
            console.error('Comment handler error:', error);
            return res.status(500).json({ error: 'Handler error' });
          }
          break;
          
        case 'AgentSession.created':
        case 'AgentSession.prompted':
          try {
            await handleAgentSessionEventHandler(event);
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
          console.log(`🤷 Unhandled event type: ${eventType}`, {
            eventType,
            availableKeys: Object.keys(event),
            fullEvent: JSON.stringify(event, null, 2)
          });
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
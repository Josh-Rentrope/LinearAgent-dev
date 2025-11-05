/**
 * Linear Webhook Signature Verification
 * 
 * Security utilities for verifying Linear webhook signatures
 * to ensure requests are authentic from Linear.
 */

import crypto from 'crypto';
import { LINEAR_OAUTH_CONFIG } from '../oauth/linear-oauth-config';

/**
 * Verify Linear webhook signature using HMAC-SHA256
 */
export function verifyLinearSignature(
  payload: string,
  signature: string,
  secret: string = LINEAR_OAUTH_CONFIG.webhookSecret
): boolean {
  if (!secret) {
    console.error('Webhook secret not configured');
    return false;
  }
  
  try {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload, 'utf8')
      .digest('hex');
    
    const expectedSignatureHeader = `sha256=${expectedSignature}`;
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignatureHeader)
    );
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

/**
 * Extract signature from Linear webhook headers
 */
export function extractLinearSignature(headers: Record<string, string>): string | null {
  // Linear sends signature in 'Linear-Signature' header
  return headers['linear-signature'] || headers['Linear-Signature'] || null;
}

/**
 * Middleware for Express.js to verify Linear webhooks
 */
export function linearWebhookMiddleware(req: any, res: any, next: any) {
  const signature = extractLinearSignature(req.headers);
  const payload = JSON.stringify(req.body);
  
  if (!signature) {
    console.warn('Missing Linear signature header');
    return res.status(401).json({ error: 'Missing signature' });
  }
  
  if (!verifyLinearSignature(payload, signature)) {
    console.warn('Invalid Linear signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }
  
  // Signature is valid, proceed
  next();
}

/**
 * Rate limiting for webhook endpoints
 */
export class WebhookRateLimiter {
  private requests = new Map<string, number[]>();
  private readonly windowMs = 60000; // 1 minute
  private readonly maxRequests = 100; // per minute
  
  isAllowed(clientId: string): boolean {
    const now = Date.now();
    const clientRequests = this.requests.get(clientId) || [];
    
    // Remove old requests outside the window
    const validRequests = clientRequests.filter(time => now - time < this.windowMs);
    
    if (validRequests.length >= this.maxRequests) {
      return false;
    }
    
    // Add current request
    validRequests.push(now);
    this.requests.set(clientId, validRequests);
    
    return true;
  }
}

export const webhookRateLimiter = new WebhookRateLimiter();
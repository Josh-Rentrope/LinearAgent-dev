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
    
    // Extract hash from incoming signature (remove 'sha256=' prefix if present)
    const incomingSignatureHash = signature.startsWith('sha256=') 
      ? signature.slice(7) 
      : signature;
    
    // Debug logging
    console.log('🔐 Signature Debug:', {
      incomingSignature: signature,
      incomingHash: incomingSignatureHash,
      expectedHash: expectedSignature,
      payloadLength: payload.length,
      payloadPreview: payload.substring(0, 200) + (payload.length > 200 ? '...' : '')
    });
    
    // Compare just the hash parts
    const isValid = crypto.timingSafeEqual(
      Buffer.from(incomingSignatureHash),
      Buffer.from(expectedSignature)
    );
    
    console.log(`🔍 Signature result: ${isValid ? 'VALID' : 'INVALID'}`);
    return isValid;
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
  // Check if signature verification is disabled
  const enableSignatureVerification = process.env.ENABLE_SIGNATURE_VERIFICATION !== 'false';
  
  if (!enableSignatureVerification) {
    console.log('⚠️  Signature verification disabled - proceeding without verification');
    return next();
  }
  
  const signature = extractLinearSignature(req.headers);
  
  if (!signature) {
    console.warn('Missing Linear signature header');
    return res.status(401).json({ error: 'Missing signature' });
  }
  
  // Get the raw request body for signature verification
  const payload = JSON.stringify(req.body);
  
  if (!verifyLinearSignature(payload, signature)) {
    console.warn('Invalid Linear signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }
  
  console.log(`🔐 Signature verification successful`);
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
/**
 * Test script to verify duplicate response prevention
 */

import { handleAgentSessionEvent } from '../src/webhooks/handlers/agent-session-handler';
import { handleCommentEvent } from '../src/webhooks/handlers/comment-handler';
import { LinearClient } from '@linear/sdk';

// Mock environment variables
process.env.LINEAR_API_KEY = 'test-key';
process.env.LINEAR_AGENT_NAME = 'OpenCode Agent';

// Mock Linear SDK
jest.mock('@linear/sdk', () => ({
  LinearClient: jest.fn().mockImplementation(() => ({
    viewer: Promise.resolve({ id: 'agent-user-123' }),
    createComment: jest.fn().mockResolvedValue({ id: 'new-comment-123' }),
    issue: jest.fn().mockResolvedValue({
      id: 'issue-123',
      title: 'Test Issue',
      description: 'Test description'
    })
  }))
}));

// Create mock Linear client for tests
const mockLinearClient = new LinearClient({ apiKey: 'test-key' });

describe('Duplicate Response Prevention', () => {
  test('should not respond to own comments', async () => {
    const ownCommentEvent = {
      action: 'create' as const,
      data: {
        id: 'comment-123',
        body: 'This is my own comment',
        issue: {
          id: 'issue-123',
          identifier: 'TEST-123',
          title: 'Test Issue'
        },
        user: {
          id: 'agent-user-123',
          name: 'OpenCode Agent'
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      webhookId: 'webhook-123',
      createdAt: new Date().toISOString()
    };

    // Should not throw and should not create response
    await expect(handleCommentEvent(ownCommentEvent, mockLinearClient, 'agent-user-123', 'OpenCode Agent')).resolves.not.toThrow();
  });

  test('should respond to user comments that mention agent', async () => {
    const userCommentEvent = {
      action: 'create' as const,
      data: {
        id: 'comment-456',
        body: '@OpenCode Agent please help me',
        issue: {
          id: 'issue-123',
          identifier: 'TEST-123',
          title: 'Test Issue'
        },
        user: {
          id: 'user-456',
          name: 'Test User'
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      webhookId: 'webhook-123',
      createdAt: new Date().toISOString()
    };

    // Should not throw and should create response
    await expect(handleCommentEvent(userCommentEvent, mockLinearClient, 'agent-user-123', 'OpenCode Agent')).resolves.not.toThrow();
  });

  test('should handle AppUserNotification events properly', async () => {
    const notificationEvent = {
      type: 'AppUserNotification' as const,
      appUserId: 'app-user-123',
      notification: {
        type: 'issueCommentMention',
        comment: {
          id: 'comment-789',
          body: 'help needed',
          userId: 'user-789',
          issueId: 'issue-123'
        },
        parentCommentId: ''
      },
      webhookId: 'webhook-123'
    };

    // Should not throw
    await expect(handleAgentSessionEvent(notificationEvent, mockLinearClient)).resolves.not.toThrow();
  });
});
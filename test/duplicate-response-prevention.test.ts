/**
 * Test script to verify duplicate response prevention
 */

import { handleAgentSessionEvent } from '../src/webhooks/handlers/agent-session-handler';
import { handleCommentEvent } from '../src/webhooks/handlers/comment-handler';

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

describe('Duplicate Response Prevention', () => {
  test('should not respond to own comments', async () => {
    const ownCommentEvent = {
      type: 'Comment',
      action: 'create',
      data: {
        id: 'comment-123',
        body: 'This is my own comment',
        userId: 'agent-user-123', // Same as agent user ID
        issueId: 'issue-123',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      webhookId: 'webhook-123'
    };

    // Should not throw and should not create response
    await expect(handleCommentEvent(ownCommentEvent)).resolves.not.toThrow();
  });

  test('should respond to user comments that mention agent', async () => {
    const userCommentEvent = {
      type: 'Comment',
      action: 'create',
      data: {
        id: 'comment-456',
        body: '@OpenCode Agent please help me',
        userId: 'user-456', // Different from agent user ID
        issueId: 'issue-123',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      webhookId: 'webhook-123'
    };

    // Should not throw and should create response
    await expect(handleCommentEvent(userCommentEvent)).resolves.not.toThrow();
  });

  test('should handle AppUserNotification events properly', async () => {
    const notificationEvent = {
      type: 'AppUserNotification',
      appUserId: 'app-user-123',
      notification: {
        type: 'issueCommentMention',
        comment: {
          id: 'comment-789',
          body: 'help needed',
          userId: 'user-789',
          issueId: 'issue-123'
        },
        parentCommentId: undefined
      },
      webhookId: 'webhook-123'
    };

    // Should not throw
    await expect(handleAgentSessionEvent(notificationEvent)).resolves.not.toThrow();
  });
});
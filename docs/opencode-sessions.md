# OpenCode Sessions Integration

This document describes the OpenCode sessions integration system that enables context-aware, multi-turn conversations between Linear and OpenCode.

## Overview

The sessions integration allows the Linear Agent to maintain conversation context across multiple interactions, providing more intelligent and helpful responses for complex development tasks.

## Architecture

### Components

1. **Session Manager** (`src/sessions/opencode-session-manager.ts`)
   - Manages session lifecycle and state
   - Handles session creation, updates, and cleanup
   - Maintains message history and context

2. **OpenCode Client** (`src/integrations/opencode-client.ts`)
   - Handles communication with OpenCode session API
   - Supports both regular and session-based responses
   - Provides streaming response capabilities

3. **Webhook Server** (`src/webhooks/agent-webhook-server.ts`)
   - Detects when to create sessions vs simple responses
   - Extracts Linear context for sessions
   - Manages session integration with webhook events

4. **Session Configuration** (`src/sessions/session-config.ts`)
   - Manages environment variables and settings
   - Provides validation and type safety
   - Handles feature flags and security settings

## Session Lifecycle

### 1. Session Creation

Sessions are automatically created when:
- User mentions contain session trigger keywords
- Comments are longer than 200 characters
- Explicit session requests are detected

**Trigger Keywords:**
- "help me", "can you help", "i need help"
- "implement", "create", "build", "develop"
- "debug", "fix", "analyze", "review"
- "session", "start a session", "let's work"

### 2. Context Extraction

Linear context is extracted from webhook payloads:
- Issue ID, title, and description
- User information and team details
- Comment content and metadata
- Timestamp and event details

### 3. Session Management

- **Status Tracking**: `creating` → `active` → `completed`/`error`/`timeout`
- **Message History**: All interactions are stored with metadata
- **Timeout Handling**: Sessions auto-expire after configured timeout
- **Cleanup**: Expired sessions are automatically cleaned up

### 4. Response Generation

- **Session Responses**: Context-aware responses using OpenCode sessions
- **Fallback Responses**: Regular responses when sessions unavailable
- **Error Handling**: Graceful degradation on API failures

## Configuration

### Environment Variables

```bash
# Core Session Settings
ENABLE_SESSIONS=true                    # Enable/disable sessions
SESSION_TIMEOUT_MINUTES=30              # Session timeout in minutes
SESSION_MAX_MESSAGES=50                 # Max messages per session
SESSION_CLEANUP_INTERVAL_MINUTES=5      # Cleanup check interval

# OpenCode Session API
OPENCODE_SESSION_API_URL=https://api.opencode.dev/sessions
OPENCODE_SESSION_TOKEN=your_session_token_here

# Storage & Persistence
SESSION_STORAGE_URL=redis://localhost:6379
ENABLE_SESSION_PERSISTENCE=true

# Features
ENABLE_SESSION_STREAMING=true            # Enable streaming responses
ENABLE_SESSION_MANAGEMENT=true          # Enable session management

# Performance
MAX_CONCURRENT_SESSIONS=100              # Max concurrent sessions
SESSION_CACHE_SIZE=1000                 # Session cache size

# Security
SESSION_REQUIRE_AUTH=false              # Require authentication
SESSION_ALLOWED_USERS=                  # Allowed user IDs (comma-separated)
SESSION_ALLOWED_TEAMS=                  # Allowed team IDs (comma-separated)
```

### Configuration Validation

The system validates configuration on startup:
- Required variables for enabled sessions
- Valid numeric values for timeouts and limits
- Proper URL formats for API endpoints
- Security settings compliance

## API Reference

### Session Manager

```typescript
// Create session
const session = await sessionManager.createSession(linearContext, options);

// Get session
const session = sessionManager.getSession(sessionId);

// Update status
sessionManager.updateSessionStatus(sessionId, 'active');

// Add message
sessionManager.addMessage(sessionId, 'user', 'Hello', metadata);

// Complete session
sessionManager.completeSession(sessionId, 'Task completed');

// Get statistics
const stats = sessionManager.getStats();
```

### OpenCode Client

```typescript
// Create session
const opencodeSession = await openCodeClient.createSession(context, message);

// Send message
const response = await openCodeClient.sendSessionMessage(sessionId, message);

// Stream response
for await (const chunk of openCodeClient.sendSessionMessage(sessionId, message, true)) {
  console.log(chunk.content);
}

// Get session status
const status = await openCodeClient.getSessionStatus(sessionId);

// Complete session
await openCodeClient.completeSession(sessionId, reason);
```

## Usage Examples

### Basic Session Creation

```typescript
// User comment in Linear:
// "@opencodeagent help me implement a user authentication system"

// System automatically:
// 1. Detects session trigger ("help me")
// 2. Extracts Linear context
// 3. Creates OpenCode session
// 4. Responds with session confirmation
```

### Context Preservation

```typescript
// First interaction:
User: "@opencodeagent help me implement authentication"
Agent: "🚀 Session Started! I'll help you implement authentication..."

// Second interaction (same issue):
User: "@opencodeagent add OAuth2 support"
Agent: "I'll add OAuth2 support to your authentication system..."
// (Agent remembers previous context about authentication)
```

### Error Handling

```typescript
// If OpenCode sessions are unavailable:
// System falls back to regular responses
// Maintains basic functionality
// Logs errors for debugging
```

## Testing

### Unit Tests

```bash
# Run session manager tests
npm test -- session-manager.test.ts

# Run integration tests
npm test -- session-integration.test.ts
```

### Test Coverage

- Session creation and lifecycle
- Message management
- Context extraction
- Error handling
- Configuration validation
- Integration with webhook server

### Mock Testing

Tests use mocked dependencies:
- OpenCode client methods
- Linear API responses
- Environment variables
- Timer functions

## Monitoring

### Session Statistics

```typescript
const stats = sessionManager.getStats();
// Returns: { total, active, completed, error, timeout }
```

### Logging

Session operations are logged with:
- Session creation and completion
- Message additions
- Status changes
- Error conditions
- Performance metrics

### Health Checks

```bash
# Check session health
curl http://localhost:3000/health

# Response includes session status and configuration
```

## Troubleshooting

### Common Issues

1. **Sessions Not Creating**
   - Check `ENABLE_SESSIONS=true`
   - Verify `OPENCODE_SESSION_TOKEN`
   - Check webhook payload structure

2. **Session Timeouts**
   - Increase `SESSION_TIMEOUT_MINUTES`
   - Check cleanup interval settings
   - Verify session activity

3. **Context Loss**
   - Ensure proper Linear context extraction
   - Check session message storage
   - Verify OpenCode session linking

4. **Performance Issues**
   - Adjust `MAX_CONCURRENT_SESSIONS`
   - Optimize cleanup intervals
   - Monitor memory usage

### Debug Mode

Enable debug logging:
```bash
DEBUG_LINEAR_WEBHOOKS=true
LOG_LEVEL=debug
```

### Session Inspection

```typescript
// Get active sessions
const activeSessions = sessionManager.getActiveSessions();

// Get specific session
const session = sessionManager.getSession(sessionId);

// Check session messages
console.log(session.messages);
```

## Security Considerations

### Authentication

- Session tokens should be kept secure
- Use environment variables for secrets
- Rotate tokens regularly
- Monitor for unauthorized access

### Access Control

- Configure allowed users and teams
- Use authentication when required
- Implement rate limiting
- Monitor session usage patterns

### Data Privacy

- Session data contains Linear issue information
- Ensure compliance with data policies
- Implement data retention policies
- Secure session storage

## Performance Optimization

### Session Limits

- Configure appropriate timeout values
- Limit maximum concurrent sessions
- Implement session cleanup
- Monitor memory usage

### Caching

- Cache session configuration
- Optimize session lookups
- Use efficient data structures
- Implement connection pooling

### Scaling

- Consider distributed session storage
- Implement load balancing
- Monitor system resources
- Plan for horizontal scaling

## Future Enhancements

### Planned Features

- Distributed session storage
- Advanced session analytics
- Custom session triggers
- Enhanced streaming support
- Session templates

### Integration Opportunities

- CI/CD pipeline integration
- Development workflow automation
- Code review automation
- Documentation generation
- Testing automation

## Support

For issues and questions:
1. Check logs for error details
2. Verify configuration settings
3. Review test examples
4. Consult troubleshooting guide
5. Contact development team

---

*This document is part of the Linear Agent OpenCode Sessions Integration system.*
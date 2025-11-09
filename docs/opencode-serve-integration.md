# OpenCode Serve Integration

This document describes the LinearAgent's integration with opencode serve for session management.

## Overview

The LinearAgent now uses opencode serve's native session management instead of custom session storage. This provides better reliability, persistence, and integration with the opencode ecosystem.

## Configuration

Add these variables to your `.env` file:

```bash
# OpenCode Serve Configuration
OPENCODE_SERVE_URL=http://127.0.0.1:53998
OPENCODE_SERVE_ENABLED=true
OPENCODE_API_KEY=your_opencode_api_key_here
```

## Usage

### Starting OpenCode Serve

```bash
# Start opencode serve in the LinearAgent directory
npm run opencode

# Or with explicit directory
npm run opencode:dev
```

### Starting the LinearAgent

```bash
# Development mode
npm run dev:webhook

# Production mode
npm run build
npm run start:webhook
```

### Testing Integration

```bash
# Test the opencode serve integration
npm run test:integration
```

## Architecture

### Before (Custom Session Management)
```
Linear Webhook → Custom Session Manager → Custom Storage → OpenCode API
```

### After (OpenCode Serve Integration)
```
Linear Webhook → Simplified Session Manager → OpenCode Serve → Native Storage
```

## Benefits

1. **Simplified Architecture**: No custom session storage to maintain
2. **Better Reliability**: Uses opencode serve's tested session persistence
3. **Native Integration**: Seamless integration with opencode ecosystem
4. **Reduced Maintenance**: Less code to maintain and debug
5. **Better Performance**: Optimized session handling by opencode serve

## Session Flow

1. **User mentions agent** in Linear issue
2. **Webhook server** receives the mention
3. **Session manager** creates lightweight session context
4. **OpenCode serve** creates native session with full context
5. **Messages flow** between Linear and opencode serve
6. **Session persists** with full conversation history

## API Endpoints Used

- `POST /session` - Create new session
- `POST /session/{id}/message` - Send messages to session
- `GET /session/{id}` - Get session details
- `POST /session/{id}/abort` - Complete session

## Migration Notes

### Legacy Configuration (Deprecated)

These variables are no longer needed:
- `OPENCODE_SESSION_API_URL`
- `OPENCODE_SESSION_TOKEN`
- `ENABLE_SESSIONS`
- `SESSION_TIMEOUT_MINUTES`
- `SESSION_MAX_MESSAGES`
- `SESSION_STORAGE_URL`
- `SESSION_CLEANUP_INTERVAL_MINUTES`

### Feature Flags (Deprecated)

These flags are no longer needed:
- `ENABLE_SESSION_MANAGEMENT`
- `ENABLE_SESSION_STREAMING`
- `ENABLE_SESSION_PERSISTENCE`

Use `OPENCODE_SERVE_ENABLED=true` instead.

## Troubleshooting

### Common Issues

1. **"OpenCode Serve integration is not enabled"**
   - Set `OPENCODE_SERVE_ENABLED=true` in `.env`
   - Ensure `OPENCODE_API_KEY` is configured

2. **"Health check failed"**
   - Start opencode serve: `npm run opencode`
   - Check `OPENCODE_SERVE_URL` is correct

3. **"Session creation failed"**
   - Verify opencode serve is running
   - Check API key permissions
   - Run `npm run test:integration` for diagnostics

### Debug Commands

```bash
# Check opencode serve status
curl http://127.0.0.1:53998/health

# Test session creation
curl -X POST http://127.0.0.1:53998/session \
  -H "Authorization: Bearer $OPENCODE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title": "Test Session"}'
```

## Development

### Running Tests

```bash
# Run integration tests
npm run test:integration

# Run unit tests
npm test

# Run with coverage
npm run test:coverage
```

### Monitoring

Check the logs for session activity:
```bash
# View agent logs
tail -f logs/agent.log

# Look for these markers:
# ✅ Created session
# 🔗 Linked OpenCode session
# 💬 Message sent to session
# ✅ Session completed
```

## Contributing

When making changes to the integration:

1. Test with `npm run test:integration`
2. Update documentation if needed
3. Tag @joshua-rentrope in PRs for review
4. Reference issue JOS-145 in commits

---
*Author: Joshua Rentrope <joshua@opencode.ai>*  
*Issue: JOS-145*  
*Updated: 2025-01-09*
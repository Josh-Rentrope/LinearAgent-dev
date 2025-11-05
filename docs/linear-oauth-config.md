# Linear Agent OAuth Configuration

## 🏗️ OAuth App Setup

### Required Configuration Parameters

**OAuth App Settings:**
- **Actor Type**: `app` (required for agent installation)
- **App Name**: OpenCode Agent
- **App Description**: AI-powered development agent that integrates Linear issues with OpenCode development environments
- **App Icon**: 🤖 (or custom OpenCode logo)

### Required Scopes

```json
{
  "scopes": [
    "app:assignable",    // Allow agent to be assigned to issues
    "app:mentionable",   // Allow agent to be mentioned in comments
    "issue:read",        // Read issue data and comments
    "issue:write",       // Create/update issues and comments
    "team:read",         // Read team information
    "user:read"          // Read user information for mentions
  ]
}
```

### Webhook Configuration

**Required Event Categories:**
- `AgentSession` - Agent mentions and delegation events
- `InboxNotifications` - Direct agent interactions
- `PermissionChanges` - Team access changes

**Webhook Endpoint:**
```
https://your-domain.com/webhooks/linear-agent
```

**Security Headers:**
```json
{
  "Linear-Signature": "HMAC-SHA256 signature verification",
  "Content-Type": "application/json"
}
```

## 🔐 Security Configuration

### Signature Verification
```typescript
import crypto from 'crypto';

function verifyLinearSignature(payload: string, signature: string, secret: string): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  return `sha256=${expectedSignature}` === signature;
}
```

### Environment Variables
```env
LINEAR_CLIENT_ID=your_oauth_client_id
LINEAR_CLIENT_SECRET=your_oauth_client_secret
LINEAR_WEBHOOK_SECRET=your_webhook_secret
LINEAR_AGENT_PUBLIC_URL=https://your-domain.com
```

## 📋 Installation Flow

### For Workspace Administrators

1. **Install App**: Navigate to Linear Settings → Apps → Install OpenCode Agent
2. **Configure Access**: 
   - Select teams that can use the agent
   - Configure default permissions
   - Set up notification preferences
3. **Verify Installation**: Agent appears in assignee dropdown and mentionable via `@OpenCode Agent`

### Agent Capabilities Post-Installation

- ✅ Can be mentioned in issue comments (`@OpenCode Agent`)
- ✅ Can be assigned to issues
- ✅ Can create and update issues
- ✅ Can add comments and activities
- ✅ Receives webhook events for interactions

## 🚀 Next Steps

1. **Create OAuth App** in Linear developer console
2. **Configure webhook endpoints** with proper security
3. **Implement agent session handlers** for webhook events
4. **Test agent installation** in development workspace
5. **Document user onboarding** process

## 📁 Files to Create

- `src/oauth/linear-oauth-config.ts` - OAuth configuration
- `src/webhooks/agent-webhook-server.ts` - Webhook server
- `src/security/signature-verification.ts` - Security utilities
- `docs/agent-installation-guide.md` - User documentation
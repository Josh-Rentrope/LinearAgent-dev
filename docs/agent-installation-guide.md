# Linear Agent Installation Guide

## 🚀 Quick Start for Workspace Administrators

### Step 1: Install the OpenCode Agent

1. Navigate to your Linear workspace
2. Go to **Settings** → **Apps** → **Install apps**
3. Search for **"OpenCode Agent"** 
4. Click **Install**

### Step 2: Configure Agent Access

During installation, you'll be asked to configure:

**Team Access:**
- Select which teams can use the agent
- Choose default permission levels
- Set notification preferences

**Agent Capabilities:**
- ✅ Can be mentioned in issues (`@OpenCode Agent`)
- ✅ Can be assigned to issues
- ✅ Can create and update issues
- ✅ Can add comments and activities

### Step 3: Verify Installation

After installation, verify the agent is working:

1. **Check Assignee Dropdown**: OpenCode Agent should appear in assignee options
2. **Test Mention**: In any issue comment, type `@OpenCode Agent` and send
3. **Verify Response**: Agent should respond with a greeting and capabilities

## 📋 Agent Usage Examples

### Basic Mention
```
@OpenCode Agent Can you help me understand this issue?
```

### Request Implementation
```
@OpenCode Agent Please implement the user authentication feature described in this issue.
```

### Ask for Help
```
@OpenCode Agent help
```

### Request Analysis
```
@OpenCode Agent Can you analyze this issue and create an implementation plan?
```

## 🔧 Configuration Options

### Workspace Settings

After installation, workspace admins can configure:

**Notification Settings:**
- When to notify users about agent activities
- Email preferences for agent responses
- Slack/Discord integrations (if available)

**Access Control:**
- Which teams can use the agent
- Permission levels for different user roles
- Rate limiting and usage quotas

**Integration Settings:**
- OpenCode instance connections
- Repository access permissions
- Deployment pipeline integrations

### User Settings

Individual users can configure:

**Personal Preferences:**
- Default agent behavior
- Preferred communication style
- Activity notification preferences

**Project Settings:**
- Auto-assignment rules
- Default project templates
- Integration with specific repositories

## 🛠️ Troubleshooting

### Agent Not Responding

**Check:**
1. Agent is properly installed in workspace
2. User has permission to mention the agent
3. Issue is in a team with agent access

**Solution:**
- Contact workspace administrator
- Re-install agent if necessary
- Check team permissions

### Permission Errors

**Common Issues:**
- Agent doesn't have access to the issue's team
- User doesn't have permission to mention agents
- Issue is in a restricted project

**Solutions:**
- Request admin to update team access
- Check user permissions
- Move issue to accessible project

### Integration Issues

**OpenCode Connection Problems:**
- Verify OpenCode instance is accessible
- Check API credentials
- Ensure network connectivity

**Solution:**
- Contact technical administrator
- Verify integration settings
- Check firewall/network configuration

## 📞 Support

For additional help:

1. **Documentation**: Check the full [Agent Documentation](./agent-documentation.md)
2. **Community**: Join our [Discord/Slack community](link-to-community)
3. **Issues**: Report bugs via [GitHub Issues](link-to-repo)
4. **Email**: Contact support@opencode.ai

## 🔄 Updates and Maintenance

The OpenCode Agent is regularly updated with:

- New capabilities and integrations
- Performance improvements
- Security updates
- Bug fixes

**Update Process:**
- Updates are applied automatically
- Workspace admins will be notified of major changes
- No action required from users

---

**Need more help?** Mention `@OpenCode Agent help` in any Linear issue for instant assistance! 🤖
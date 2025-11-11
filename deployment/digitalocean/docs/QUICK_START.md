# LinearAgent Quick Start Guide

Get your LinearAgent running in minutes with this quick start guide.

## 🎯 What You'll Deploy

LinearAgent is an AI-powered assistant that integrates Linear with OpenCode to automate development workflows. Once deployed, it will:

- 🤖 Respond to mentions in Linear issues
- 📝 Create and manage development tasks
- 🔗 Integrate with OpenCode for AI-powered assistance
- 📊 Provide real-time progress updates
- 🔄 Handle webhook events from Linear

## ⚡ 5-Minute Local Setup

### 1. Prerequisites Check

Ensure you have these installed:
```bash
# Check Docker
docker --version

# Check Docker Compose
docker-compose --version

# Check Node.js (for local development)
node --version
```

### 2. Clone and Configure

```bash
# Clone the repository
git clone https://github.com/your-org/LinearAgent.git
cd LinearAgent

# Copy environment template
cp .env.development .env
```

### 3. Add Your Credentials

Edit the `.env` file with your Linear and OpenCode credentials:

```bash
# Required: Linear Configuration
LINEAR_CLIENT_ID=your_linear_client_id
LINEAR_CLIENT_SECRET=your_linear_client_secret
LINEAR_WEBHOOK_SECRET=your_webhook_secret
LINEAR_API_KEY=your_linear_api_key
LINEAR_BOT_OAUTH_TOKEN=your_bot_oauth_token

# Required: OpenCode Configuration
OPENCODE_API_KEY=your_opencode_api_key

# Optional: Agent Configuration
LINEAR_AGENT_NAME=My Linear Agent
OPENCODE_SERVE_ENABLED=true
```

**Where to get these values:**
- **Linear**: Settings → Apps → Create app → OAuth & API keys
- **OpenCode**: Account settings → API keys

### 4. Start the Agent

```bash
# Start with Docker Compose
docker-compose up -d

# Or run locally (requires Node.js)
npm install
npm run dev
```

### 5. Verify Installation

```bash
# Check health status
curl http://localhost:3000/health

# Expected response:
# {"status":"healthy","agent":"OpenCode Agent","timestamp":"2024-01-01T12:00:00.000Z"}
```

## 🌐 Production Deployment (10 Minutes)

### Option A: Simple Docker Deployment

1. **Prepare production environment**
   ```bash
   cp .env.production .env
   # Edit .env with production credentials
   ```

2. **Deploy with monitoring**
   ```bash
   docker-compose --profile monitoring up -d
   ```

3. **Access your services**
   - Application: http://localhost:3000
   - Monitoring: http://localhost:3001 (Grafana)

### Option B: Cloud Deployment with Terraform

1. **Install Terraform**
   ```bash
   # macOS
   brew install terraform
   
   # Ubuntu/Debian
   sudo apt-get install terraform
   ```

2. **Configure DigitalOcean**
   ```bash
   cd terraform
   cp terraform.tfvars.example terraform.tfvars
   
   # Edit terraform.tfvars:
   do_token="your_digitalocean_token"
   domain_name="your-domain.com"
   ssh_public_key="ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC..."
   letsencrypt_email="admin@your-domain.com"
   ```

3. **Deploy infrastructure**
   ```bash
   terraform init
   terraform plan
   terraform apply
   ```

4. **Configure your domain**
   Point your domain's A record to the load balancer IP from Terraform output.

## 🧪 Test Your Installation

### 1. Test Webhook Endpoint

```bash
# Test health endpoint
curl http://localhost:3000/health

# Test with webhook payload
curl -X POST http://localhost:3000/webhooks/linear-agent \
  -H "Content-Type: application/json" \
  -H "X-Linear-Webhook-Signature: test" \
  -d '{"type":"Comment","action":"create","data":{"id":"test"}}'
```

### 2. Test Linear Integration

1. Go to your Linear workspace
2. Open any issue
3. Add a comment: `@OpenCode Agent hello`
4. You should receive a response from the agent

### 3. Test OpenCode Integration

If `OPENCODE_SERVE_ENABLED=true`:

```bash
# Test OpenCode serve connection
curl http://localhost:53998/health
```

## 🔧 Common Configuration Options

### Enable/Disable Features

```bash
# In your .env file:

# AI responses
ENABLE_AI_RESPONSES=true

# OpenCode integration
ENABLE_OPENCODE_INTEGRATION=true

# Advanced features
ENABLE_ADVANCED_FEATURES=true

# Debug mode
DEBUG_LINEAR_WEBHOOKS=true
```

### Rate Limiting

```bash
# Adjust rate limits (requests per window)
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_WINDOW_MS=900000  # 15 minutes
```

### Logging

```bash
# Log level: debug, info, warn, error
LOG_LEVEL=info

# Log file location
LOG_FILE=logs/agent.log
```

## 🚨 Troubleshooting

### Port Already in Use

```bash
# Check what's using port 3000
lsof -i :3000

# Kill the process
kill -9 <PID>

# Or use a different port
LINEAR_WEBHOOK_PORT=3001
```

### Permission Denied

```bash
# Fix file permissions
chmod +x scripts/deploy/deploy.sh
chmod 600 .env
```

### Docker Issues

```bash
# Reset Docker environment
docker-compose down -v
docker system prune -f
docker-compose up -d
```

### Environment Variables Not Loading

```bash
# Verify .env file exists
ls -la .env

# Check syntax
cat .env

# Restart with fresh environment
docker-compose down
docker-compose up -d
```

## 📚 Next Steps

1. **Configure Linear Webhook**
   - Go to Linear Settings → Webhooks
   - Add webhook URL: `https://your-domain.com/webhooks/linear-agent`
   - Set secret to match `LINEAR_WEBHOOK_SECRET`

2. **Set Up Monitoring**
   - Access Grafana at http://localhost:3001
   - Create dashboards for your metrics
   - Set up alerts for critical issues

3. **Configure Backups**
   ```bash
   # Enable automated backups
   ./scripts/deploy/deploy.sh prod backup
   ```

4. **Customize Agent Behavior**
   - Modify response templates in `src/templates/`
   - Add custom handlers in `src/handlers/`
   - Update prompts in `src/prompts/`

## 🆘 Need Help?

- **Documentation**: [Full Deployment Guide](./DEPLOYMENT.md)
- **Issues**: [GitHub Issues](https://github.com/your-org/LinearAgent/issues)
- **Community**: [Discord Server](https://discord.gg/your-invite)
- **Email**: support@yourdomain.com

## 🎉 You're Ready!

Your LinearAgent is now running and ready to help automate your development workflows. Start by mentioning the agent in any Linear issue:

```
@OpenCode Agent help me understand this issue
```

Happy automating! 🚀
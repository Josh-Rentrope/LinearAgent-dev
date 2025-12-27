# Linear Agent for OpenCode

A Linear agent for OpenCode that automates development workflows, manages issues, and provides intelligent assistance for software development teams.

## 🚀 Quick Start

### Prerequisites

- Node.js 18.0.0 or higher
- Linear workspace with admin access
- OpenCode installation (optional but recommended)
- Git for cloning the repository

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/Josh-Rentrope/LinearAgent-dev.git
cd LinearAgent-dev
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment variables**
```bash
cp .env.example .env
# Edit .env with your configuration (see Configuration section)
```

4. **Build the project**
```bash
npm run build
```

## 🔧 Configuration

### Step 1: Linear API Setup

1. **Create Linear App**
   - Go to [Linear Developer Portal](https://linear.app/settings/api)
   - Click "Create new OAuth app"
   - Fill in app details:
     - **Name**: OpenCode Agent
     - **Description**: AI agent for automated development workflows
     - **Website**: Your project website
     - **Callback URL**: `https://your-domain.com/auth/linear/callback`

2. **Generate API Keys**
   - Get your **Client ID** and **Client Secret**
   - Generate an **API Key** for server-side operations
   - Create a **Webhook Secret** for webhook security
   
 Your Domain can either be on a publicly accessible IP/domain, or using a tunnel service like ngrok (see below)

### Step 2: OpenCode Setup (Optional)

1. **Get OpenCode API Key**
   - Visit [OpenCode Dashboard](https://opencode.dev/dashboard)
   - Generate an API key
   - Note your webhook secret

2. **Configure OpenCode Serve**
   - Install OpenCode CLI: `npm install -g opencode`
   - Set up your development environment

### Step 3: Environment Variables

Edit your `.env` file with the following required variables:

```bash
# Linear Configuration (Required)
LINEAR_CLIENT_ID=your_linear_oauth_client_id
LINEAR_CLIENT_SECRET=your_linear_oauth_client_secret
LINEAR_WEBHOOK_SECRET=your_linear_webhook_secret
LINEAR_API_KEY=your_linear_api_key_here

# Server Configuration (Required)
LINEAR_AGENT_PUBLIC_URL=https://your-domain.com
LINEAR_WEBHOOK_PORT=3000
NODE_ENV=development

# Security (Required)
JWT_SECRET=your_jwt_secret_for_sessions
ENCRYPTION_KEY=your_32_character_encryption_key

# OpenCode Integration (Optional but recommended)
OPENCODE_API_KEY=your_opencode_api_key_here
OPENCODE_SERVE_URL=http://127.0.0.1:53998
OPENCODE_SERVE_ENABLED=true
```

For a complete list of environment variables, see [.env.example](./.env.example).

## 🚦 Running the Agent

### Development Mode

1. **Start the main agent server**
```bash
npm run dev
```

2. **Start webhook server (in separate terminal)**
```bash
npm run dev:webhook
```

### Production Mode

1. **Build the project**
```bash
npm run build
```

2. **Start the servers**
```bash
# Main agent
npm run start

# Webhook server (in separate terminal)
npm run start:webhook
```

## 🖥️ How to Launch Script

For Windows users, you can use this batch script to launch all required services:

```batch
@echo off
title Launch Linear Agent Environment

start "opencode" serve --port 53998

echo Starting Linear Agent Server...
start "Linear Agent Server" /D "path\to\LinearAgent-dev" "npm" run start --

echo All services started! Check your opened windows for details.
pause
```

For Linux users, the process is similar.

```bash

opencode serve --port 53998

# In the LinearAgent-dev directory
npm run start --
```

## 🔌 Webhook Configuration

### Setting up Linear Webhooks

1. **Go to Linear Settings → Webhooks**
2. **Create new webhook**
   - **URL**: `https://your-domain.com/webhooks/linear`
   - **Secret**: Use your `LINEAR_WEBHOOK_SECRET`
   - **Events**: Select relevant events (comments, issues, etc.)

3. **Test the webhook**
   - Use the test button in Linear
   - Check your agent logs for incoming webhook data

### Using Ngrok for Development

For local development, use Ngrok to expose your local server:

1. **Install Ngrok**
```bash
npm install -g ngrok
```

2. **Start Ngrok**
```bash
ngrok http 3000
```

3. **Update Linear Webhook URL**
   - Use the Ngrok URL provided (e.g., `https://abc123.ngrok.io`)
   - Set webhook URL to `https://abc123.ngrok.io/webhooks/linear`
   - You will also need to update your [Linear Agent Integration](https://linear.app/joshua-rentrope/settings/agents) with the correct webhook information 
## 🤖 Agent Usage

### Installing the Agent in Linear

1. **Navigate to your Linear workspace**
2. **Go to Settings → Apps → Install apps**
3. **Search for "OpenCode Agent"**
4. **Click Install**

### Using the Agent

Once installed, you can interact with the agent using mentions:

```bash
# Basic help
@OpenCode Agent help

# Request implementation
@OpenCode Agent Please implement user authentication

# Ask for analysis
@OpenCode Agent Can you analyze this issue and create a plan?

# Request code review
@OpenCode Agent Please review this code and suggest improvements
```

## 🧪 Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run integration tests
npm run test:integration
```

### Manual Testing

```bash
# Test OpenCode integration
npm run test:integration

# Debug environment variables
node scripts/debug-env.js
```

## 📁 Project Structure

```
LinearAgent-dev/
├── src/
│   ├── activities/         # Activity emission and tracking
│   ├── integrations/       # OpenCode client integration
│   ├── oauth/             # Linear OAuth configuration
│   ├── security/          # Security and signature verification
│   ├── sessions/          # Session management
│   ├── todos/             # Todo management
│   ├── utils/             # Utility functions
│   ├── webhooks/          # Webhook handlers and server
│   └── index.ts           # Main entry point
├── docs/                  # Documentation
├── scripts/               # Utility scripts
├── test/                  # Test files
└── dist/                  # Compiled TypeScript output
```

## 🛠️ Development Commands

```bash
# Development
npm run dev              # Start main agent in development
npm run dev:webhook      # Start webhook server in development
npm run dev:simple       # Start simple webhook server

# Building
npm run build           # Compile TypeScript
npm run clean           # Clean dist directory

# Linting
npm run lint            # Run ESLint
npm run lint:fix        # Fix ESLint issues

# OpenCode integration
npm run opencode         # Start OpenCode serve
npm run opencode:dev     # Start OpenCode in development
```

## 🔒 Security Considerations

- **Always use HTTPS in production**
- **Keep your `.env` file secure and never commit it**
- **Use strong secrets for JWT and encryption**
- **Enable signature verification for webhooks**
- **Regularly rotate your API keys**

## 🐛 Troubleshooting

### Common Issues

1. **Agent not responding to mentions**
   - Check if agent is installed in the workspace
   - Verify webhook is receiving events
   - Check agent logs for errors

2. **Webhook verification failed**
   - Ensure `LINEAR_WEBHOOK_SECRET` matches Linear settings
   - Check if your server is publicly accessible (use Ngrok for local dev)

3. **OpenCode integration not working**
   - Verify `OPENCODE_API_KEY` is valid
   - Check OpenCode server is running on configured port
   - Ensure network connectivity

4. **Environment variables not loading**
   - Verify `.env` file is in the project root
   - Check for syntax errors in `.env` file
   - Run `node scripts/debug-env.js` to verify loading

### Debug Mode

Enable debug logging by setting in your `.env`:

```bash
DEBUG_LINEAR_WEBHOOKS=true
LOG_LEVEL=debug
```

## 📚 Additional Documentation

- [Agent Installation Guide](./docs/agent-installation-guide.md)
- [Linear OAuth Configuration](./docs/linear-oauth-config.md)
- [OpenCode Serve Integration](./docs/opencode-serve-integration.md)
- [Session Management](./docs/opencode-sessions.md)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run tests and ensure they pass
6. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

If you need help:

1. **Check the documentation** above
2. **Search existing issues** on GitHub
3. **Create a new issue** with detailed information
4. **Join our community** (link to Discord/Slack)

---

**Need instant help?** Mention `@OpenCode Agent help` in any Linear issue! 🤖

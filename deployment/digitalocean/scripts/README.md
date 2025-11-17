# LinearAgent Deployment Scripts

This directory contains cross-platform deployment scripts for LinearAgent.

## 📁 Script Overview

### Main Scripts
- `deploy.sh` - Linux/macOS deployment script
- `deploy.ps1` - Windows PowerShell deployment script

### Usage

#### Linux/macOS
```bash
# Make executable
chmod +x scripts/deploy/deploy.sh

# Initialize development environment
./scripts/deploy/deploy.sh dev init

# Deploy to production
./scripts/deploy/deploy.sh prod deploy

# Check status
./scripts/deploy/deploy.sh prod status

# Show logs
./scripts/deploy/deploy.sh dev logs

# Create backup
./scripts/deploy/deploy.sh prod backup

# Restore from backup
./scripts/deploy/deploy.sh prod restore backup-file.tar.gz

# Update application
./scripts/deploy/deploy.sh prod update

# Destroy infrastructure
./scripts/deploy/deploy.sh prod destroy
```

#### Windows PowerShell
```powershell
# Initialize development environment
.\scripts\deploy\deploy.ps1 dev init

# Deploy to production
.\scripts\deploy\deploy.ps1 prod deploy

# Check status
.\scripts\deploy\deploy.ps1 prod status

# Show logs
.\scripts\deploy\deploy.ps1 dev logs

# Create backup
.\scripts\deploy\deploy.ps1 prod backup

# Restore from backup
.\scripts\deploy\deploy.ps1 prod restore backup-file.tar.gz

# Update application
.\scripts\deploy\deploy.ps1 prod update

# Destroy infrastructure
.\scripts\deploy\deploy.ps1 prod destroy
```

## 🎯 Available Commands

| Command | Description | Example |
|---------|-------------|---------|
| `init` | Initialize environment and dependencies | `./deploy.sh dev init` |
| `deploy` | Deploy application | `./deploy.sh prod deploy` |
| `status` | Check deployment status | `./deploy.sh prod status` |
| `logs` | Show application logs | `./deploy.sh dev logs` |
| `backup` | Create data backup | `./deploy.sh prod backup` |
| `restore` | Restore from backup | `./deploy.sh prod restore backup.tar.gz` |
| `update` | Update application | `./deploy.sh prod update` |
| `destroy` | Destroy infrastructure | `./deploy.sh prod destroy` |
| `help` | Show help message | `./deploy.sh help` |

## 🔧 Environment Types

### Development (`dev`)
- Uses `.env.development` template
- Enables debug logging
- Uses local Docker Compose
- No SSL/TLS required
- Hot reloading enabled

### Production (`prod`)
- Uses `.env.production` template
- Optimized for performance
- Includes monitoring stack
- SSL/TLS configured
- Automated backups

## 📋 Prerequisites

### Required Tools
- **Docker** 20.10+
- **Docker Compose** 2.0+
- **Terraform** 1.0+ (for cloud deployment)
- **Git** (for updates)

### Optional Tools
- **Make** (for convenience commands)
- **Node.js** 18+ (for local development)
- **OpenSSL** (for SSL certificate management)

## 🚀 Quick Start

### 1. Clone Repository
```bash
git clone https://github.com/your-org/LinearAgent.git
cd LinearAgent
```

### 2. Initialize Environment
```bash
# Linux/macOS
./scripts/deploy/deploy.sh dev init

# Windows
.\scripts\deploy\deploy.ps1 dev init
```

### 3. Configure Credentials
```bash
# Edit environment file
nano .env

# Or use your favorite editor
code .env
```

### 4. Deploy
```bash
# Linux/macOS
./scripts/deploy/deploy.sh dev deploy

# Windows
.\scripts\deploy\deploy.ps1 dev deploy
```

### 5. Verify
```bash
curl http://localhost:3000/health
```

## 🔍 Script Features

### Dependency Checking
Scripts automatically verify required tools are installed:
- Docker and Docker Compose
- Terraform (for cloud deployment)
- Git (for updates)

### Environment Management
- Automatic environment file creation
- Directory structure setup
- Permission configuration
- Template copying

### Docker Operations
- Multi-stage image building
- Container orchestration
- Health checks
- Log management
- Service monitoring

### Terraform Integration
- Infrastructure provisioning
- State management
- Output handling
- Resource cleanup

### Backup & Recovery
- Automated data backup
- Configuration backup
- Restore functionality
- Retention management

### Monitoring & Logging
- Real-time log streaming
- Health status checking
- Performance metrics
- Error reporting

## 🛠️ Advanced Usage

### Custom Environments
Create custom environment types by:
1. Copying existing template
2. Modifying configuration
3. Updating script logic

### CI/CD Integration
Scripts are designed for CI/CD pipelines:
```yaml
# GitHub Actions example
- name: Deploy LinearAgent
  run: ./scripts/deploy/deploy.sh prod deploy
  env:
    LINEAR_API_KEY: ${{ secrets.LINEAR_API_KEY }}
    OPENCODE_API_KEY: ${{ secrets.OPENCODE_API_KEY }}
```

### Automation
Schedule automated tasks:
```bash
# Crontab for daily backups
0 2 * * * /path/to/LinearAgent/scripts/deploy/deploy.sh prod backup

# Systemd service for monitoring
[Unit]
Description=LinearAgent Monitor
[Service]
Type=oneshot
ExecStart=/path/to/LinearAgent/scripts/deploy/deploy.sh prod status
[Install]
WantedBy=multi-user.target
```

## 🔧 Configuration

### Script Configuration
Scripts can be configured via environment variables:

```bash
# Custom Docker Compose file
export COMPOSE_FILE=docker-compose.custom.yml

# Custom Terraform directory
export TF_DIR=./custom-terraform

# Custom backup location
export BACKUP_DIR=/custom/backup/path
```

### Environment Variables
Key environment variables used by scripts:

```bash
# Deployment
ENVIRONMENT=dev|prod
COMMAND=init|deploy|status|logs|backup|restore|update|destroy

# Paths
SCRIPT_DIR=./scripts/deploy
PROJECT_ROOT=..
TERRAFORM_DIR=../terraform

# Docker
COMPOSE_FILE=docker-compose.yml
DOCKER_REGISTRY=your-registry.com
IMAGE_TAG=latest

# Terraform
TF_VAR_do_token=your_token
TF_VAR_region=nyc3
TF_VAR_droplet_size=s-2vcpu-4gb
```

## 🚨 Troubleshooting

### Common Issues

#### Permission Denied
```bash
# Fix script permissions
chmod +x scripts/deploy/deploy.sh

# Fix file permissions
sudo chown -R $USER:$USER /opt/linear-agent
```

#### Docker Issues
```bash
# Reset Docker
docker system prune -f
docker-compose down -v
docker-compose up -d

# Check Docker status
docker info
docker-compose ps
```

#### Terraform Issues
```bash
# Reinitialize Terraform
rm -rf .terraform
terraform init

# Check Terraform version
terraform version

# Debug Terraform
TF_LOG=DEBUG terraform plan
```

#### Environment Issues
```bash
# Check environment variables
env | grep -E "(LINEAR|OPENCODE|NODE_ENV)"

# Validate .env file
cat .env

# Recreate environment
cp .env.production .env
```

### Debug Mode

Enable debug logging:
```bash
# Set debug level
export LOG_LEVEL=debug

# Enable script debugging
bash -x ./scripts/deploy/deploy.sh prod deploy

# PowerShell debugging
$VerbosePreference = "Continue"
.\scripts\deploy\deploy.ps1 prod deploy
```

## 📚 Additional Resources

- [Full Deployment Guide](../DEPLOYMENT.md)
- [Quick Start Guide](../QUICK_START.md)
- [Terraform Documentation](../terraform/README.md)
- [Docker Documentation](../docker/README.md)

## 🤝 Contributing

To contribute to the deployment scripts:

1. Fork the repository
2. Create a feature branch
3. Test scripts on multiple platforms
4. Update documentation
5. Submit a pull request

### Testing Scripts

```bash
# Test on Linux
bash -n scripts/deploy/deploy.sh

# Test on macOS
zsh -n scripts/deploy/deploy.sh

# Test PowerShell syntax
powershell -Command "Get-Command .\scripts\deploy\deploy.ps1"
```

---

Need help? Check the [troubleshooting section](#-troubleshooting) or open an issue on GitHub.
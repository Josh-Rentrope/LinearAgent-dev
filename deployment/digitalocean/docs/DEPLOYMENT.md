# LinearAgent Deployment Guide

This guide provides comprehensive instructions for deploying the LinearAgent to production using Docker, Docker Compose, and Terraform on DigitalOcean.

## 🚀 Quick Start

### Prerequisites

- **Docker** 20.10+ and **Docker Compose** 2.0+
- **Terraform** 1.0+
- **DigitalOcean** account with API token
- **Domain name** (optional, for SSL)
- **Git** for cloning the repository

### Local Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-org/LinearAgent.git
   cd LinearAgent
   ```

2. **Set up environment**
   ```bash
   # Linux/macOS
   chmod +x scripts/deploy/deploy.sh
   ./scripts/deploy/deploy.sh dev init
   
   # Windows PowerShell
   .\scripts\deploy\deploy.ps1 dev init
   ```

3. **Configure credentials**
   ```bash
   cp .env.development .env
   # Edit .env with your Linear and OpenCode credentials
   ```

4. **Start development server**
   ```bash
   # Linux/macOS
   ./scripts/deploy/deploy.sh dev deploy
   
   # Windows PowerShell
   .\scripts\deploy\deploy.ps1 dev deploy
   ```

5. **Verify deployment**
   ```bash
   curl http://localhost:3000/health
   ```

## 🏗️ Production Deployment

### Option 1: Docker Compose (Simple Production)

1. **Prepare production environment**
   ```bash
   cp .env.production .env
   # Edit .env with production credentials
   ```

2. **Deploy with monitoring**
   ```bash
   docker-compose --profile monitoring up -d
   ```

3. **Access services**
   - Application: http://localhost:3000
   - Grafana: http://localhost:3001 (admin/admin123)
   - Prometheus: http://localhost:9090

### Option 2: Terraform on DigitalOcean (Recommended)

1. **Configure Terraform variables**
   ```bash
   cd terraform
   cp terraform.tfvars.example terraform.tfvars
   # Edit terraform.tfvars with your values
   ```

2. **Initialize and deploy**
   ```bash
   terraform init
   terraform plan
   terraform apply
   ```

3. **Configure application**
   ```bash
   # SSH into the new droplet
   ssh root@<droplet-ip>
   
   # Update environment file
   sudo nano /opt/linear-agent/.env
   
   # Restart service
   sudo systemctl restart linear-agent
   ```

## 📋 Configuration

### Environment Variables

#### Required Variables
- `LINEAR_CLIENT_ID`: Linear OAuth client ID
- `LINEAR_CLIENT_SECRET`: Linear OAuth client secret
- `LINEAR_WEBHOOK_SECRET`: Linear webhook secret
- `LINEAR_API_KEY`: Linear API key
- `LINEAR_BOT_OAUTH_TOKEN`: Linear bot OAuth token
- `OPENCODE_API_KEY`: OpenCode API key

#### Optional Variables
- `REDIS_HOST`: Redis server host
- `REDIS_PASSWORD`: Redis password
- `JWT_SECRET`: JWT signing secret
- `ENCRYPTION_KEY`: 32-character encryption key

### SSL/TLS Configuration

#### Automatic SSL (Let's Encrypt)
The Terraform deployment automatically configures SSL certificates using Let's Encrypt.

#### Manual SSL
1. Place certificates in `ssl/` directory:
   ```
   ssl/
   ├── cert.pem
   └── key.pem
   ```

2. Update nginx configuration:
   ```nginx
   ssl_certificate /etc/nginx/ssl/cert.pem;
   ssl_certificate_key /etc/nginx/ssl/key.pem;
   ```

## 🔧 Operations

### Monitoring

#### Health Checks
- Application: `GET /health`
- Docker: `docker-compose ps`
- Terraform: `terraform show`

#### Logs
```bash
# Application logs
docker-compose logs -f linear-agent

# All services
docker-compose logs -f

# System logs (Terraform deployment)
sudo journalctl -u linear-agent -f
```

#### Metrics
- **Prometheus**: http://your-domain:9090
- **Grafana**: http://your-domain:3001
- **Custom metrics**: Available at `/metrics` endpoint

### Backup and Recovery

#### Automated Backups
```bash
# Create backup
./scripts/deploy/deploy.sh prod backup

# Restore from backup
./scripts/deploy/deploy.sh prod restore backup-file.tar.gz
```

#### Manual Backup
```bash
# Backup data and configuration
tar -czf backup-$(date +%Y%m%d).tar.gz \
  data/ logs/ .env ssl/

# Restore
tar -xzf backup-YYYYMMDD.tar.gz
```

### Updates

#### Application Updates
```bash
# Update to latest version
./scripts/deploy/deploy.sh prod update
```

#### Infrastructure Updates
```bash
cd terraform
terraform plan
terraform apply
```

## 🔒 Security

### Network Security
- Firewall configured for ports 22, 80, 443
- Rate limiting on webhook endpoints
- SSL/TLS encryption enforced
- Security headers configured

### Application Security
- Environment variables for secrets
- Non-root Docker user
- Input validation and sanitization
- Webhook signature verification

### Access Control
- SSH key authentication
- Principle of least privilege
- Regular security updates
- Audit logging enabled

## 🚨 Troubleshooting

### Common Issues

#### Container Won't Start
```bash
# Check logs
docker-compose logs linear-agent

# Check configuration
docker-compose config

# Restart services
docker-compose down && docker-compose up -d
```

#### Health Check Fails
```bash
# Check port availability
netstat -tlnp | grep :3000

# Test endpoint manually
curl -v http://localhost:3000/health

# Check environment variables
docker-compose exec linear-agent env | grep LINEAR
```

#### SSL Certificate Issues
```bash
# Check certificate status
sudo certbot certificates

# Renew certificates
sudo certbot renew

# Test SSL configuration
openssl s_client -connect your-domain.com:443
```

#### Performance Issues
```bash
# Check resource usage
docker stats

# Monitor system resources
htop
df -h

# Check application metrics
curl http://localhost:3000/metrics
```

### Debug Mode

Enable debug logging:
```bash
# Set environment variable
export LOG_LEVEL=debug

# Or update .env file
echo "LOG_LEVEL=debug" >> .env

# Restart application
docker-compose restart linear-agent
```

## 📊 Scaling

### Horizontal Scaling

#### Multiple Instances
```yaml
# docker-compose.yml
services:
  linear-agent:
    deploy:
      replicas: 3
```

#### Load Balancing
The Terraform configuration includes a DigitalOcean Load Balancer for automatic distribution.

### Vertical Scaling

#### Resource Allocation
```bash
# Update droplet size
terraform apply -var="droplet_size=s-4vcpu-8gb"
```

#### Database Scaling
```bash
# Upgrade Redis cluster
terraform apply -var="redis_size=db-s-2vcpu-4gb"
```

## 🔄 CI/CD Integration

### GitHub Actions Example

```yaml
name: Deploy LinearAgent
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v2
        
      - name: Deploy Infrastructure
        run: |
          cd terraform
          terraform init
          terraform apply -auto-approve
        env:
          TF_VAR_do_token: ${{ secrets.DO_TOKEN }}
```

### GitLab CI/CD Example

```yaml
deploy:
  stage: deploy
  script:
    - apt-get update && apt-get install -y terraform
    - cd terraform
    - terraform init
    - terraform apply -auto-approve
  only:
    - main
```

## 📚 Additional Resources

### Documentation
- [LinearAgent API Documentation](./docs/api.md)
- [Linear Integration Guide](./docs/linear-integration.md)
- [OpenCode Integration Guide](./docs/opencode-integration.md)

### Support
- [GitHub Issues](https://github.com/your-org/LinearAgent/issues)
- [Discord Community](https://discord.gg/your-invite)
- [Email Support](mailto:support@yourdomain.com)

### Contributing
- [Contributing Guide](./CONTRIBUTING.md)
- [Development Setup](./docs/development.md)
- [Code of Conduct](./CODE_OF_CONDUCT.md)

---

**Need help?** Check the [troubleshooting section](#-troubleshooting) or open an issue on GitHub.
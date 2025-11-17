#!/bin/bash
# LinearAgent Deployment Script for Linux/macOS
# Usage: ./deploy.sh [dev|prod] [init|deploy|destroy|status]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TERRAFORM_DIR="$PROJECT_ROOT/terraform"
ENVIRONMENT=${1:-dev}
COMMAND=${2:-deploy}

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check dependencies
check_dependencies() {
    log_info "Checking dependencies..."
    
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is not installed"
        exit 1
    fi
    
    if ! command -v terraform &> /dev/null; then
        log_error "Terraform is not installed"
        exit 1
    fi
    
    log_success "All dependencies are installed"
}

# Environment setup
setup_environment() {
    log_info "Setting up $ENVIRONMENT environment..."
    
    # Copy environment file if it doesn't exist
    if [ ! -f "$PROJECT_ROOT/.env" ]; then
        if [ -f "$PROJECT_ROOT/.env.example" ]; then
            cp "$PROJECT_ROOT/.env.example" "$PROJECT_ROOT/.env"
            log_warning "Created .env file from example. Please update with your values."
        else
            log_error ".env.example file not found"
            exit 1
        fi
    fi
    
    # Create necessary directories
    mkdir -p "$PROJECT_ROOT/logs"
    mkdir -p "$PROJECT_ROOT/data"
    mkdir -p "$PROJECT_ROOT/ssl"
    
    log_success "Environment setup complete"
}

# Docker operations
docker_build() {
    log_info "Building Docker image..."
    cd "$PROJECT_ROOT"
    docker build -t linear-agent:latest .
    log_success "Docker image built successfully"
}

docker_deploy() {
    log_info "Deploying with Docker Compose..."
    cd "$PROJECT_ROOT"
    
    if [ "$ENVIRONMENT" = "prod" ]; then
        docker-compose -f docker-compose.yml --profile monitoring up -d
    else
        docker-compose -f docker-compose.yml up -d
    fi
    
    log_success "Docker Compose deployment complete"
}

docker_stop() {
    log_info "Stopping Docker containers..."
    cd "$PROJECT_ROOT"
    docker-compose down
    log_success "Docker containers stopped"
}

# Terraform operations
terraform_init() {
    log_info "Initializing Terraform..."
    cd "$TERRAFORM_DIR"
    
    if [ ! -f "terraform.tfvars" ]; then
        if [ -f "terraform.tfvars.example" ]; then
            cp terraform.tfvars.example terraform.tfvars
            log_warning "Created terraform.tfvars from example. Please update with your values."
        else
            log_error "terraform.tfvars.example file not found"
            exit 1
        fi
    fi
    
    terraform init
    log_success "Terraform initialized"
}

terraform_deploy() {
    log_info "Deploying infrastructure with Terraform..."
    cd "$TERRAFORM_DIR"
    
    terraform plan -out=tfplan
    terraform apply tfplan
    
    log_success "Terraform deployment complete"
    
    # Show outputs
    log_info "Deployment outputs:"
    terraform output
}

terraform_destroy() {
    log_warning "Destroying infrastructure with Terraform..."
    cd "$TERRAFORM_DIR"
    
    terraform destroy
    log_success "Infrastructure destroyed"
}

# Status checking
check_status() {
    log_info "Checking deployment status..."
    
    # Docker status
    if command -v docker-compose &> /dev/null; then
        cd "$PROJECT_ROOT"
        log_info "Docker containers:"
        docker-compose ps
    fi
    
    # Terraform status
    if [ -d "$TERRAFORM_DIR" ] && command -v terraform &> /dev/null; then
        cd "$TERRAFORM_DIR"
        log_info "Terraform state:"
        terraform show
    fi
    
    # Health check
    if curl -f http://localhost:3000/health &> /dev/null; then
        log_success "Application health check passed"
    else
        log_warning "Application health check failed"
    fi
}

# Logs
show_logs() {
    log_info "Showing application logs..."
    cd "$PROJECT_ROOT"
    docker-compose logs -f
}

# Backup
backup_data() {
    log_info "Creating backup..."
    
    BACKUP_DIR="$PROJECT_ROOT/backups"
    mkdir -p "$BACKUP_DIR"
    
    TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
    BACKUP_FILE="$BACKUP_DIR/linear-agent-backup-$TIMESTAMP.tar.gz"
    
    tar -czf "$BACKUP_FILE" \
        "$PROJECT_ROOT/data" \
        "$PROJECT_ROOT/logs" \
        "$PROJECT_ROOT/.env" \
        "$PROJECT_ROOT/ssl"
    
    log_success "Backup created: $BACKUP_FILE"
}

# Restore
restore_data() {
    if [ -z "$3" ]; then
        log_error "Please provide backup file path"
        exit 1
    fi
    
    BACKUP_FILE="$3"
    
    if [ ! -f "$BACKUP_FILE" ]; then
        log_error "Backup file not found: $BACKUP_FILE"
        exit 1
    fi
    
    log_warning "Restoring from backup: $BACKUP_FILE"
    
    # Stop services
    docker_stop
    
    # Extract backup
    tar -xzf "$BACKUP_FILE" -C "$PROJECT_ROOT"
    
    # Start services
    docker_deploy
    
    log_success "Restore complete"
}

# Update
update_application() {
    log_info "Updating application..."
    
    # Pull latest code
    cd "$PROJECT_ROOT"
    git pull origin main
    
    # Rebuild and redeploy
    docker_build
    docker_deploy
    
    log_success "Application updated successfully"
}

# Help
show_help() {
    echo "LinearAgent Deployment Script"
    echo ""
    echo "Usage: $0 [ENVIRONMENT] [COMMAND] [OPTIONS]"
    echo ""
    echo "ENVIRONMENTS:"
    echo "  dev     Development environment"
    echo "  prod    Production environment"
    echo ""
    echo "COMMANDS:"
    echo "  init    Initialize environment and dependencies"
    echo "  deploy  Deploy the application"
    echo "  destroy Destroy infrastructure (Terraform only)"
    echo "  status  Check deployment status"
    echo "  logs    Show application logs"
    echo "  backup  Create data backup"
    echo "  restore Restore from backup"
    echo "  update  Update application"
    echo "  help    Show this help message"
    echo ""
    echo "EXAMPLES:"
    echo "  $0 dev init          # Initialize development environment"
    echo "  $0 prod deploy        # Deploy to production"
    echo "  $0 dev logs          # Show development logs"
    echo "  $0 prod backup        # Create production backup"
    echo "  $0 dev restore backup.tar.gz  # Restore from backup"
}

# Main execution
main() {
    log_info "LinearAgent Deployment Script"
    log_info "Environment: $ENVIRONMENT"
    log_info "Command: $COMMAND"
    
    case "$COMMAND" in
        "init")
            check_dependencies
            setup_environment
            terraform_init
            docker_build
            ;;
        "deploy")
            check_dependencies
            setup_environment
            docker_build
            docker_deploy
            ;;
        "destroy")
            terraform_destroy
            ;;
        "status")
            check_status
            ;;
        "logs")
            show_logs
            ;;
        "backup")
            backup_data
            ;;
        "restore")
            restore_data "$@"
            ;;
        "update")
            update_application
            ;;
        "help"|"--help"|"-h")
            show_help
            ;;
        *)
            log_error "Unknown command: $COMMAND"
            show_help
            exit 1
            ;;
    esac
}

# Run main function
main "$@"
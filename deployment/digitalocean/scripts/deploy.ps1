# LinearAgent Deployment Script for Windows PowerShell
# Usage: .\deploy.ps1 [dev|prod] [init|deploy|destroy|status]

param(
    [Parameter(Position=0)]
    [ValidateSet("dev", "prod")]
    [string]$Environment = "dev",
    
    [Parameter(Position=1)]
    [ValidateSet("init", "deploy", "destroy", "status", "logs", "backup", "restore", "update", "help")]
    [string]$Command = "deploy",
    
    [Parameter(Position=2)]
    [string]$BackupFile = ""
)

# Configuration
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$TerraformDir = Join-Path $ProjectRoot "terraform"

# Logging functions
function Write-LogInfo {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Blue
}

function Write-LogSuccess {
    param([string]$Message)
    Write-Host "[SUCCESS] $Message" -ForegroundColor Green
}

function Write-LogWarning {
    param([string]$Message)
    Write-Host "[WARNING] $Message" -ForegroundColor Yellow
}

function Write-LogError {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

# Check dependencies
function Test-Dependencies {
    Write-LogInfo "Checking dependencies..."
    
    try {
        $null = Get-Command docker -ErrorAction Stop
        Write-LogSuccess "Docker is installed"
    } catch {
        Write-LogError "Docker is not installed"
        exit 1
    }
    
    try {
        $null = Get-Command docker-compose -ErrorAction Stop
        Write-LogSuccess "Docker Compose is installed"
    } catch {
        Write-LogError "Docker Compose is not installed"
        exit 1
    }
    
    try {
        $null = Get-Command terraform -ErrorAction Stop
        Write-LogSuccess "Terraform is installed"
    } catch {
        Write-LogError "Terraform is not installed"
        exit 1
    }
    
    Write-LogSuccess "All dependencies are installed"
}

# Environment setup
function Initialize-Environment {
    Write-LogInfo "Setting up $Environment environment..."
    
    # Copy environment file if it doesn't exist
    $EnvFile = Join-Path $ProjectRoot ".env"
    $EnvExample = Join-Path $ProjectRoot ".env.example"
    
    if (-not (Test-Path $EnvFile)) {
        if (Test-Path $EnvExample) {
            Copy-Item $EnvExample $EnvFile
            Write-LogWarning "Created .env file from example. Please update with your values."
        } else {
            Write-LogError ".env.example file not found"
            exit 1
        }
    }
    
    # Create necessary directories
    $Directories = @(
        (Join-Path $ProjectRoot "logs"),
        (Join-Path $ProjectRoot "data"),
        (Join-Path $ProjectRoot "ssl")
    )
    
    foreach ($Dir in $Directories) {
        if (-not (Test-Path $Dir)) {
            New-Item -ItemType Directory -Path $Dir -Force | Out-Null
        }
    }
    
    Write-LogSuccess "Environment setup complete"
}

# Docker operations
function Build-DockerImage {
    Write-LogInfo "Building Docker image..."
    Set-Location $ProjectRoot
    
    try {
        docker build -t linear-agent:latest .
        Write-LogSuccess "Docker image built successfully"
    } catch {
        Write-LogError "Failed to build Docker image: $_"
        exit 1
    }
}

function Deploy-Docker {
    Write-LogInfo "Deploying with Docker Compose..."
    Set-Location $ProjectRoot
    
    try {
        if ($Environment -eq "prod") {
            docker-compose -f docker-compose.yml --profile monitoring up -d
        } else {
            docker-compose -f docker-compose.yml up -d
        }
        Write-LogSuccess "Docker Compose deployment complete"
    } catch {
        Write-LogError "Failed to deploy with Docker Compose: $_"
        exit 1
    }
}

function Stop-Docker {
    Write-LogInfo "Stopping Docker containers..."
    Set-Location $ProjectRoot
    
    try {
        docker-compose down
        Write-LogSuccess "Docker containers stopped"
    } catch {
        Write-LogError "Failed to stop Docker containers: $_"
        exit 1
    }
}

# Terraform operations
function Initialize-Terraform {
    Write-LogInfo "Initializing Terraform..."
    Set-Location $TerraformDir
    
    $TfVars = Join-Path $TerraformDir "terraform.tfvars"
    $TfVarsExample = Join-Path $TerraformDir "terraform.tfvars.example"
    
    if (-not (Test-Path $TfVars)) {
        if (Test-Path $TfVarsExample) {
            Copy-Item $TfVarsExample $TfVars
            Write-LogWarning "Created terraform.tfvars from example. Please update with your values."
        } else {
            Write-LogError "terraform.tfvars.example file not found"
            exit 1
        }
    }
    
    try {
        terraform init
        Write-LogSuccess "Terraform initialized"
    } catch {
        Write-LogError "Failed to initialize Terraform: $_"
        exit 1
    }
}

function Deploy-Terraform {
    Write-LogInfo "Deploying infrastructure with Terraform..."
    Set-Location $TerraformDir
    
    try {
        terraform plan -out=tfplan
        terraform apply tfplan
        Write-LogSuccess "Terraform deployment complete"
        
        # Show outputs
        Write-LogInfo "Deployment outputs:"
        terraform output
    } catch {
        Write-LogError "Failed to deploy with Terraform: $_"
        exit 1
    }
}

function Remove-Terraform {
    Write-LogWarning "Destroying infrastructure with Terraform..."
    Set-Location $TerraformDir
    
    try {
        terraform destroy
        Write-LogSuccess "Infrastructure destroyed"
    } catch {
        Write-LogError "Failed to destroy infrastructure: $_"
        exit 1
    }
}

# Status checking
function Get-DeploymentStatus {
    Write-LogInfo "Checking deployment status..."
    
    # Docker status
    if (Get-Command docker-compose -ErrorAction SilentlyContinue) {
        Set-Location $ProjectRoot
        Write-LogInfo "Docker containers:"
        docker-compose ps
    }
    
    # Terraform status
    if ((Test-Path $TerraformDir) -and (Get-Command terraform -ErrorAction SilentlyContinue)) {
        Set-Location $TerraformDir
        Write-LogInfo "Terraform state:"
        terraform show
    }
    
    # Health check
    try {
        $Response = Invoke-WebRequest -Uri "http://localhost:3000/health" -TimeoutSec 5 -ErrorAction Stop
        if ($Response.StatusCode -eq 200) {
            Write-LogSuccess "Application health check passed"
        } else {
            Write-LogWarning "Application health check failed"
        }
    } catch {
        Write-LogWarning "Application health check failed"
    }
}

# Logs
function Show-Logs {
    Write-LogInfo "Showing application logs..."
    Set-Location $ProjectRoot
    
    try {
        docker-compose logs -f
    } catch {
        Write-LogError "Failed to show logs: $_"
        exit 1
    }
}

# Backup
function Backup-Data {
    Write-LogInfo "Creating backup..."
    
    $BackupDir = Join-Path $ProjectRoot "backups"
    if (-not (Test-Path $BackupDir)) {
        New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
    }
    
    $Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $BackupFile = Join-Path $BackupDir "linear-agent-backup-$Timestamp.tar.gz"
    
    try {
        $ItemsToBackup = @(
            (Join-Path $ProjectRoot "data"),
            (Join-Path $ProjectRoot "logs"),
            (Join-Path $ProjectRoot ".env"),
            (Join-Path $ProjectRoot "ssl")
        )
        
        & tar -czf $BackupFile $ItemsToBackup
        Write-LogSuccess "Backup created: $BackupFile"
    } catch {
        Write-LogError "Failed to create backup: $_"
        exit 1
    }
}

# Restore
function Restore-Data {
    if ([string]::IsNullOrEmpty($BackupFile)) {
        Write-LogError "Please provide backup file path"
        exit 1
    }
    
    if (-not (Test-Path $BackupFile)) {
        Write-LogError "Backup file not found: $BackupFile"
        exit 1
    }
    
    Write-LogWarning "Restoring from backup: $BackupFile"
    
    try {
        # Stop services
        Stop-Docker
        
        # Extract backup
        & tar -xzf $BackupFile -C $ProjectRoot
        
        # Start services
        Deploy-Docker
        
        Write-LogSuccess "Restore complete"
    } catch {
        Write-LogError "Failed to restore from backup: $_"
        exit 1
    }
}

# Update
function Update-Application {
    Write-LogInfo "Updating application..."
    
    try {
        # Pull latest code
        Set-Location $ProjectRoot
        git pull origin main
        
        # Rebuild and redeploy
        Build-DockerImage
        Deploy-Docker
        
        Write-LogSuccess "Application updated successfully"
    } catch {
        Write-LogError "Failed to update application: $_"
        exit 1
    }
}

# Help
function Show-Help {
    Write-Host "LinearAgent Deployment Script for PowerShell"
    Write-Host ""
    Write-Host "Usage: .\deploy.ps1 [ENVIRONMENT] [COMMAND] [OPTIONS]"
    Write-Host ""
    Write-Host "ENVIRONMENTS:"
    Write-Host "  dev     Development environment"
    Write-Host "  prod    Production environment"
    Write-Host ""
    Write-Host "COMMANDS:"
    Write-Host "  init    Initialize environment and dependencies"
    Write-Host "  deploy  Deploy the application"
    Write-Host "  destroy Destroy infrastructure (Terraform only)"
    Write-Host "  status  Check deployment status"
    Write-Host "  logs    Show application logs"
    Write-Host "  backup  Create data backup"
    Write-Host "  restore Restore from backup"
    Write-Host "  update  Update application"
    Write-Host "  help    Show this help message"
    Write-Host ""
    Write-Host "EXAMPLES:"
    Write-Host "  .\deploy.ps1 dev init          # Initialize development environment"
    Write-Host "  .\deploy.ps1 prod deploy        # Deploy to production"
    Write-Host "  .\deploy.ps1 dev logs          # Show development logs"
    Write-Host "  .\deploy.ps1 prod backup        # Create production backup"
    Write-Host "  .\deploy.ps1 dev restore backup.tar.gz  # Restore from backup"
}

# Main execution
function Main {
    Write-LogInfo "LinearAgent Deployment Script"
    Write-LogInfo "Environment: $Environment"
    Write-LogInfo "Command: $Command"
    
    switch ($Command) {
        "init" {
            Test-Dependencies
            Initialize-Environment
            Initialize-Terraform
            Build-DockerImage
        }
        "deploy" {
            Test-Dependencies
            Initialize-Environment
            Build-DockerImage
            Deploy-Docker
        }
        "destroy" {
            Remove-Terraform
        }
        "status" {
            Get-DeploymentStatus
        }
        "logs" {
            Show-Logs
        }
        "backup" {
            Backup-Data
        }
        "restore" {
            Restore-Data
        }
        "update" {
            Update-Application
        }
        "help" {
            Show-Help
        }
        default {
            Write-LogError "Unknown command: $Command"
            Show-Help
            exit 1
        }
    }
}

# Run main function
Main
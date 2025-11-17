/*
 * LinearAgent Production Infrastructure
 * Complete Terraform configuration for deploying LinearAgent to DigitalOcean
 * 
 * FEATURES:
 * - Droplet provisioning with Docker
 * - Managed database (Redis)
 * - Load balancer with SSL termination
 * - Firewall configuration
 * - Automated backups
 * - Monitoring integration
 * - DNS management
 * 
 * USAGE:
 * 1. Configure variables in terraform.tfvars
 * 2. Run: terraform init
 * 3. Run: terraform plan
 * 4. Run: terraform apply
 */

terraform {
  required_version = ">= 1.0"
  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.0"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

# Provider configuration
provider "digitalocean" {
  token = var.do_token
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

# Random password generation
resource "random_password" "redis_password" {
  length  = 32
  special = false
}

resource "random_password" "app_secret" {
  length  = 64
  special = true
}

# SSH key for droplet access
resource "digitalocean_ssh_key" "default" {
  name       = "linear-agent-key"
  public_key = var.ssh_public_key
}

# VPC for network isolation
resource "digitalocean_vpc" "linear_agent" {
  name   = "linear-agent-vpc"
  region = var.region
}

# Firewall configuration
resource "digitalocean_firewall" "linear_agent" {
  name = "linear-agent-firewall"

  droplet_ids = [digitalocean_droplet.linear_agent.id]

  inbound_rule {
    protocol         = "tcp"
    port_range       = "22"
    source_addresses = ["0.0.0.0/0"]
  }

  inbound_rule {
    protocol         = "tcp"
    port_range       = "80"
    source_addresses = ["0.0.0.0/0"]
  }

  inbound_rule {
    protocol         = "tcp"
    port_range       = "443"
    source_addresses = ["0.0.0.0/0"]
  }

  inbound_rule {
    protocol         = "tcp"
    port_range       = "8080"
    source_addresses = var.monitoring_ips
  }

  outbound_rule {
    protocol              = "tcp"
    port_range            = "1-65535"
    destination_addresses = ["0.0.0.0/0"]
  }

  outbound_rule {
    protocol              = "udp"
    port_range            = "1-65535"
    destination_addresses = ["0.0.0.0/0"]
  }
}

# Managed Redis database
resource "digitalocean_database_cluster" "redis" {
  name       = "linear-agent-redis"
  engine     = "redis"
  version    = "7"
  size       = "db-s-1vcpu-1gb"
  region     = var.region
  node_count = 1
  private_network_uuid = digitalocean_vpc.linear_agent.id
}

# Main application droplet
resource "digitalocean_droplet" "linear_agent" {
  name   = "linear-agent-prod"
  region = var.region
  size   = var.droplet_size
  image  = "docker-20-04"
  
  vpc_uuid = digitalocean_vpc.linear_agent.id
  
  ssh_keys = [digitalocean_ssh_key.default.fingerprint]
  
  user_data = templatefile("${path.module}/cloud-init.yml", {
    redis_host     = digitalocean_database_cluster.redis.private_host
    redis_password = random_password.redis_password.result
    app_secret     = random_password.app_secret.result
    domain_name    = var.domain_name
    email          = var.letsencrypt_email
  })

  tags = ["linear-agent", "production", "web"]

  # Backup configuration
  backup_policy {
    backup_type = "weekly"
    weekday     = "sunday"
    hour        = 2
  }

  # Monitoring
  monitoring = true
}

# Load balancer
resource "digitalocean_loadbalancer" "linear_agent" {
  name   = "linear-agent-lb"
  region = var.region

  forwarding_rule {
    entry_port     = 80
    entry_protocol = "http"

    target_port     = 80
    target_protocol = "http"
  }

  forwarding_rule {
    entry_port     = 443
    entry_protocol = "https"

    target_port     = 80
    target_protocol = "http"

    certificate_id = digitalocean_certificate.linear_agent.id
  }

  healthcheck {
    port     = 80
    protocol = "http"
    path     = "/health"
  }

  droplet_ids = [digitalocean_droplet.linear_agent.id]

  redirect_http_to_https = true
}

# SSL certificate
resource "digitalocean_certificate" "linear_agent" {
  name    = "linear-agent-cert"
  type    = "lets_encrypt"
  domains = [var.domain_name]
}

# DNS records (if using Cloudflare)
resource "cloudflare_record" "www" {
  count   = var.use_cloudflare ? 1 : 0
  zone_id = var.cloudflare_zone_id
  name    = var.domain_name
  value   = digitalocean_loadbalancer.linear_agent.ip
  type    = "A"
  ttl     = 3600
}

resource "cloudflare_record" "root" {
  count   = var.use_cloudflare ? 1 : 0
  zone_id = var.cloudflare_zone_id
  name    = "@"
  value   = digitalocean_loadbalancer.linear_agent.ip
  type    = "A"
  ttl     = 3600
}

# Volume for persistent storage
resource "digitalocean_volume" "data" {
  region                  = var.region
  name                    = "linear-agent-data"
  size                    = 50
  initial_filesystem_type = "ext4"
  description             = "Persistent storage for LinearAgent data and logs"
}

resource "digitalocean_volume_attachment" "data" {
  droplet_id = digitalocean_droplet.linear_agent.id
  volume_id  = digitalocean_volume.data.id
}

# Project organization
resource "digitalocean_project" "linear_agent" {
  name        = "LinearAgent"
  description = "Linear to OpenCode AI Agent Infrastructure"
  purpose     = "Web Application"
  environment = "Production"

  resources = [
    digitalocean_droplet.linear_agent.urn,
    digitalocean_volume.data.urn,
    digitalocean_database_cluster.redis.urn,
    digitalocean_loadbalancer.linear_agent.urn,
    digitalocean_firewall.linear_agent.urn
  ]
}
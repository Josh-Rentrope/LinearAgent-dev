/*
 * Variables for LinearAgent Infrastructure
 * Configure these values in terraform.tfvars
 */

variable "do_token" {
  description = "DigitalOcean API token"
  type        = string
  sensitive   = true
}

variable "cloudflare_api_token" {
  description = "Cloudflare API token (optional)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "cloudflare_zone_id" {
  description = "Cloudflare zone ID (optional)"
  type        = string
  default     = ""
}

variable "ssh_public_key" {
  description = "SSH public key for droplet access"
  type        = string
}

variable "region" {
  description = "DigitalOcean region"
  type        = string
  default     = "nyc3"
}

variable "droplet_size" {
  description = "Droplet size"
  type        = string
  default     = "s-2vcpu-4gb"
}

variable "domain_name" {
  description = "Domain name for the application"
  type        = string
}

variable "letsencrypt_email" {
  description = "Email for Let's Encrypt certificates"
  type        = string
}

variable "use_cloudflare" {
  description = "Whether to use Cloudflare for DNS"
  type        = bool
  default     = false
}

variable "monitoring_ips" {
  description = "IP addresses allowed for monitoring access"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}
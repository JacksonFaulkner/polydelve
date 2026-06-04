variable "aws_region" {
  default = "us-east-1"
}

variable "app_name" {
  default = "polydelve"
}

# Secrets — pass via TF_VAR_* env vars, never commit values
variable "motherduck_token" {
  sensitive = true
}

variable "openai_api_key" {
  sensitive = true
}

variable "exa_api_key" {
  sensitive = true
}

variable "gcp_sa_json" {
  description = "Full GCP service account JSON string"
  sensitive   = true
}

variable "auth0_domain" {}

variable "auth0_audience" {}

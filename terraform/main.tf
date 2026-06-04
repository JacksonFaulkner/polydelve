terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
  required_version = ">= 1.5"
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project = var.app_name
    }
  }
}

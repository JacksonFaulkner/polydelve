output "ecr_repository_url" {
  value = aws_ecr_repository.backend.repository_url
}

output "backend_endpoint" {
  value = aws_ecs_express_gateway_service.backend.ingress_paths
}

output "frontend_url" {
  value = "https://${aws_cloudfront_distribution.frontend.domain_name}"
}

output "frontend_bucket" {
  value = aws_s3_bucket.frontend.bucket
}

output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.frontend.id
}

output "rds_endpoint" {
  value = aws_db_instance.main.endpoint
}

output "rds_database_url_secret_arn" {
  value = aws_secretsmanager_secret.db_url.arn
}

output "assets_cdn_url" {
  value = "https://assets.polydelve.com"
}

output "assets_bucket" {
  value = aws_s3_bucket.assets.bucket
}

output "ci_assets_access_key_id" {
  value     = aws_iam_access_key.ci_assets.id
  sensitive = true
}

output "ci_assets_secret_access_key" {
  value     = aws_iam_access_key.ci_assets.secret
  sensitive = true
}

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

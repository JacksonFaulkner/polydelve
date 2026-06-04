resource "aws_acm_certificate" "main" {
  domain_name               = "polydelve.com"
  subject_alternative_names = ["www.polydelve.com"]
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

output "acm_validation_cnames" {
  value = aws_acm_certificate.main.domain_validation_options
}

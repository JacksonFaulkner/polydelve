resource "aws_route53_zone" "main" {
  name = "polydelve.com"
}

resource "aws_route53_record" "apex" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "polydelve.com"
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.frontend.domain_name
    zone_id                = aws_cloudfront_distribution.frontend.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "www" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "www.polydelve.com"
  type    = "CNAME"
  ttl     = 300
  records = [aws_cloudfront_distribution.frontend.domain_name]
}

resource "aws_route53_record" "assets" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "assets.polydelve.com"
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.assets.domain_name
    zone_id                = aws_cloudfront_distribution.assets.hosted_zone_id
    evaluate_target_health = false
  }
}

output "route53_nameservers" {
  value = aws_route53_zone.main.name_servers
}

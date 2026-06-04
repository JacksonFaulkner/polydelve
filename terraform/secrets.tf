locals {
  secrets = {
    motherduck_token = var.motherduck_token
    openai_api_key   = var.openai_api_key
    exa_api_key      = var.exa_api_key
    gcp_sa_json      = var.gcp_sa_json
    auth0_domain     = var.auth0_domain
    auth0_audience   = var.auth0_audience
  }
}

resource "aws_secretsmanager_secret" "app" {
  for_each = local.secrets
  name     = "${var.app_name}/${each.key}"
}

resource "aws_secretsmanager_secret_version" "app" {
  for_each      = local.secrets
  secret_id     = aws_secretsmanager_secret.app[each.key].id
  secret_string = each.value
}

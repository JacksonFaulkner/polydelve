resource "aws_cloudwatch_log_group" "backend" {
  name              = "/ecs/${var.app_name}/backend"
  retention_in_days = 30
}

resource "aws_ecs_cluster" "main" {
  name = var.app_name
}

resource "aws_ecs_express_gateway_service" "backend" {
  service_name            = "${var.app_name}-backend-v2"
  cluster                 = aws_ecs_cluster.main.name
  execution_role_arn      = aws_iam_role.execution.arn
  task_role_arn           = aws_iam_role.task.arn
  infrastructure_role_arn = aws_iam_role.infrastructure.arn
  cpu                     = 512
  memory                  = 1024
  health_check_path       = "/health"
  wait_for_steady_state   = true

  primary_container {
    image          = "${aws_ecr_repository.backend.repository_url}:latest"
    container_port = 8000

    aws_logs_configuration {
      log_group         = aws_cloudwatch_log_group.backend.name
      log_stream_prefix = "backend"
    }

    environment {
      name  = "DB_PATH"
      value = "md:polydelve"
    }

    environment {
      name  = "AVATARS_BUCKET"
      value = aws_s3_bucket.avatars.bucket
    }

    environment {
      name  = "AVATARS_REGION"
      value = var.aws_region
    }

    secret {
      name       = "MOTHERDUCK_TOKEN"
      value_from = aws_secretsmanager_secret.app["motherduck_token"].arn
    }

    secret {
      name       = "OPENAI_API_KEY"
      value_from = aws_secretsmanager_secret.app["openai_api_key"].arn
    }

    secret {
      name       = "EXA_API_KEY"
      value_from = aws_secretsmanager_secret.app["exa_api_key"].arn
    }

    secret {
      name       = "GCP_SA_JSON"
      value_from = aws_secretsmanager_secret.app["gcp_sa_json"].arn
    }

    secret {
      name       = "AUTH0_DOMAIN"
      value_from = aws_secretsmanager_secret.app["auth0_domain"].arn
    }

    secret {
      name       = "AUTH0_AUDIENCE"
      value_from = aws_secretsmanager_secret.app["auth0_audience"].arn
    }
  }

  scaling_target {
    min_task_count             = 1
    max_task_count             = 5
    auto_scaling_metric        = "AVERAGE_CPU"
    auto_scaling_target_value  = 70
  }

  depends_on = [
    aws_iam_role_policy_attachment.execution_base,
    aws_iam_role_policy.execution_secrets,
    aws_iam_role_policy_attachment.infrastructure_express,
  ]
}

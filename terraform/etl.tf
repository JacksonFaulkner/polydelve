# ── ETL task definition ────────────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "etl" {
  name              = "/ecs/${var.app_name}/etl"
  retention_in_days = 14
}

resource "aws_ecs_task_definition" "etl" {
  family                   = "${var.app_name}-etl"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 2048
  memory                   = 8192
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([{
    name      = "etl"
    image     = "${aws_ecr_repository.backend.repository_url}:latest"
    essential = true

    # Default command — overridden per run via ECS command override
    command = ["python", "-m", "etl.run", "hourly"]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.etl.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "etl"
      }
    }

    environment = [
      { name = "AVATARS_BUCKET", value = aws_s3_bucket.avatars.bucket },
      { name = "AVATARS_REGION", value = var.aws_region },
    ]

    secrets = [
      { name = "DATABASE_URL",   valueFrom = aws_secretsmanager_secret.db_url.arn },
      { name = "OPENAI_API_KEY", valueFrom = aws_secretsmanager_secret.app["openai_api_key"].arn },
      { name = "EXA_API_KEY",    valueFrom = aws_secretsmanager_secret.app["exa_api_key"].arn },
      { name = "GCP_SA_JSON",    valueFrom = aws_secretsmanager_secret.app["gcp_sa_json"].arn },
      { name = "BQ_SA_JSON",     valueFrom = aws_secretsmanager_secret.app["bq_sa_json"].arn },
    ]
  }])
}

# ── EventBridge scheduled rule (every 2 hours) ────────────────────────────────

resource "aws_iam_role" "eventbridge_etl" {
  name = "${var.app_name}-eventbridge-etl"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRole"
      Principal = { Service = "scheduler.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "eventbridge_etl_run_task" {
  name = "run-etl-task"
  role = aws_iam_role.eventbridge_etl.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["ecs:RunTask"]
        Resource = aws_ecs_task_definition.etl.arn
      },
      {
        Effect   = "Allow"
        Action   = ["iam:PassRole"]
        Resource = [
          aws_iam_role.execution.arn,
          aws_iam_role.task.arn,
        ]
      }
    ]
  })
}

resource "aws_scheduler_schedule" "etl_hourly" {
  name       = "${var.app_name}-etl-hourly"
  group_name = "default"

  flexible_time_window {
    mode                      = "FLEXIBLE"
    maximum_window_in_minutes = 10
  }

  schedule_expression = "rate(2 hours)"

  target {
    arn      = aws_ecs_cluster.main.arn
    role_arn = aws_iam_role.eventbridge_etl.arn

    ecs_parameters {
      task_definition_arn = aws_ecs_task_definition.etl.arn
      launch_type         = "FARGATE"

      network_configuration {
        subnets          = data.aws_subnets.default.ids
        security_groups  = [aws_security_group.rds.id]
        assign_public_ip = true
      }
    }

    retry_policy {
      maximum_retry_attempts       = 2
      maximum_event_age_in_seconds = 3600
    }
  }
}
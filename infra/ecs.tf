# コンテナの実行(docs/22_インフラ設計.md の 3.1)
#
# - Fargate(ARM64)。パブリックサブネットに置き、公開 IP を付ける(NAT がないため)。
#   受信は ALB のセキュリティグループからだけ(network.tf)
# - サービスのタスク定義は、デプロイの CI が新しいイメージで更新するため、Terraform では変更を無視する

resource "aws_cloudwatch_log_group" "app" {
  name              = "/ecs/${var.project}"
  retention_in_days = 7
}

resource "aws_ecs_cluster" "main" {
  name = var.project
}

locals {
  image = "${aws_ecr_repository.backend.repository_url}:${var.image_tag}"
}

resource "aws_ecs_task_definition" "app" {
  family                   = "${var.project}-backend"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512  # 0.5 vCPU
  memory                   = 1024 # 1 GB
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = aws_iam_role.task.arn

  runtime_platform {
    cpu_architecture        = "ARM64"
    operating_system_family = "LINUX"
  }

  container_definitions = jsonencode([{
    name      = "backend"
    image     = local.image
    essential = true

    portMappings = [{ containerPort = 3000, protocol = "tcp" }]

    environment = [
      { name = "NODE_ENV", value = "production" },
      { name = "PORT", value = "3000" },
      { name = "DB_HOST", value = aws_db_instance.main.address },
      { name = "DB_PORT", value = tostring(aws_db_instance.main.port) },
      { name = "DB_NAME", value = aws_db_instance.main.db_name },
      { name = "S3_BUCKET", value = aws_s3_bucket.photos.bucket },
      { name = "S3_REGION", value = var.region },
      { name = "LOCATION_REGION", value = var.region },
    ]

    # Secrets Manager の値は、起動のときに ECS が注入する(タスク定義にも state にも、値は入らない)
    secrets = [
      { name = "DB_USER", valueFrom = "${aws_db_instance.main.master_user_secret[0].secret_arn}:username::" },
      { name = "DB_PASSWORD", valueFrom = "${aws_db_instance.main.master_user_secret[0].secret_arn}:password::" },
      { name = "JWT_SECRET", valueFrom = aws_secretsmanager_secret.jwt_secret.arn },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.app.name
        "awslogs-region"        = var.region
        "awslogs-stream-prefix" = "backend"
      }
    }
  }])
}

resource "aws_ecs_service" "app" {
  name            = "${var.project}-backend"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  # 起動直後は、ヘルスチェックの失敗でタスクを止めない
  health_check_grace_period_seconds = 60

  enable_execute_command = false

  # 新しいタスクが起動できないとき、前の版へ自動で戻す
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.app.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app.arn
    container_name   = "backend"
    container_port   = 3000
  }

  depends_on = [aws_lb_listener.http]

  lifecycle {
    # デプロイの CI が、新しいイメージのタスク定義へ更新する
    ignore_changes = [task_definition]
  }
}

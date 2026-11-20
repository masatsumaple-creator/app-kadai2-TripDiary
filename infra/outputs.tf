output "vpc_id" {
  value = aws_vpc.main.id
}

output "public_subnet_ids" {
  value = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  value = aws_subnet.private[*].id
}

output "security_group_ids" {
  value = {
    alb = aws_security_group.alb.id
    app = aws_security_group.app.id
    db  = aws_security_group.db.id
  }
}

output "ecr_repository_url" {
  value = aws_ecr_repository.backend.repository_url
}

output "db_address" {
  value = aws_db_instance.main.address
}

output "db_port" {
  value = aws_db_instance.main.port
}

output "db_name" {
  value = aws_db_instance.main.db_name
}

output "db_master_secret_arn" {
  description = "RDS が作った、DB のマスター認証情報の Secrets Manager の ARN"
  value       = aws_db_instance.main.master_user_secret[0].secret_arn
}

output "jwt_secret_arn" {
  value = aws_secretsmanager_secret.jwt_secret.arn
}

output "alb_dns_name" {
  value = aws_lb.main.dns_name
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "ecs_service_name" {
  value = aws_ecs_service.app.name
}

output "ecs_task_definition_family" {
  value = aws_ecs_task_definition.app.family
}

output "cloudfront_domain_name" {
  value = aws_cloudfront_distribution.main.domain_name
}

output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.main.id
}

output "frontend_bucket" {
  value = aws_s3_bucket.frontend.bucket
}

# GitHub のリポジトリの「変数」に設定する値(秘密情報ではない)。scripts/set-github-variables.mjs が、これを読んで設定する
output "github_actions_variables" {
  value = {
    AWS_REGION                 = var.region
    AWS_ROLE_ARN               = aws_iam_role.github_deploy.arn
    ECR_REPOSITORY_URL         = aws_ecr_repository.backend.repository_url
    ECS_CLUSTER                = aws_ecs_cluster.main.name
    ECS_SERVICE                = aws_ecs_service.app.name
    ECS_TASK_FAMILY            = aws_ecs_task_definition.app.family
    PUBLIC_SUBNET_IDS          = join(",", aws_subnet.public[*].id)
    APP_SECURITY_GROUP_ID      = aws_security_group.app.id
    FRONTEND_BUCKET            = aws_s3_bucket.frontend.bucket
    CLOUDFRONT_DISTRIBUTION_ID = aws_cloudfront_distribution.main.id
    CLOUDFRONT_DOMAIN          = aws_cloudfront_distribution.main.domain_name
  }
}

output "photos_bucket" {
  value = aws_s3_bucket.photos.bucket
}

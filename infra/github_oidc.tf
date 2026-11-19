# GitHub Actions(deploy.yml)が AWS を操作するための権限(docs/22_インフラ設計.md の 6 章)
#
# - 長期のアクセスキーは使わない。GitHub OIDC で、実行のたびに一時的な認証情報を受け取る
# - 信頼するのは、このリポジトリの main ブランチからの実行だけ
# - 権限は、デプロイに必要な最小限(ECR へのプッシュ、ECS の更新、フロントの S3、CloudFront の無効化)

locals {
  github_oidc_url = "https://token.actions.githubusercontent.com"
  account_id      = data.aws_caller_identity.current.account_id
}

resource "aws_iam_openid_connect_provider" "github" {
  count = var.create_github_oidc_provider ? 1 : 0

  url            = local.github_oidc_url
  client_id_list = ["sts.amazonaws.com"]
}

data "aws_iam_openid_connect_provider" "github" {
  count = var.create_github_oidc_provider ? 0 : 1

  url = local.github_oidc_url
}

locals {
  github_oidc_provider_arn = var.create_github_oidc_provider ? aws_iam_openid_connect_provider.github[0].arn : data.aws_iam_openid_connect_provider.github[0].arn
}

data "aws_iam_policy_document" "github_deploy_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [local.github_oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    # このリポジトリの main ブランチだけ(ほかのブランチ・PR・フォークからは引き受けられない)
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["${var.github_oidc_subject_prefix != "" ? var.github_oidc_subject_prefix : "repo:${var.github_repository}"}:ref:refs/heads/main"]
    }
  }
}

resource "aws_iam_role" "github_deploy" {
  name               = "${var.project}-github-deploy"
  assume_role_policy = data.aws_iam_policy_document.github_deploy_assume.json
}

data "aws_iam_policy_document" "github_deploy" {
  statement {
    sid       = "EcrAuthorization"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"] # この操作は、リソースを指定できない
  }

  statement {
    sid = "EcrPush"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage",
      "ecr:CompleteLayerUpload",
      "ecr:GetDownloadUrlForLayer",
      "ecr:InitiateLayerUpload",
      "ecr:PutImage",
      "ecr:UploadLayerPart",
    ]
    resources = [aws_ecr_repository.backend.arn]
  }

  # タスク定義の取得・登録は、リソースを指定できない
  statement {
    sid       = "EcsTaskDefinitions"
    actions   = ["ecs:DescribeTaskDefinition", "ecs:RegisterTaskDefinition"]
    resources = ["*"]
  }

  statement {
    sid       = "EcsService"
    actions   = ["ecs:DescribeServices", "ecs:UpdateService"]
    resources = [aws_ecs_service.app.id]
  }

  # マイグレーションの 1 回限りのタスク(このクラスターだけ)
  statement {
    sid       = "EcsRunMigrationTask"
    actions   = ["ecs:RunTask"]
    resources = ["arn:aws:ecs:${var.region}:${local.account_id}:task-definition/${aws_ecs_task_definition.app.family}:*"]

    condition {
      test     = "ArnEquals"
      variable = "ecs:cluster"
      values   = [aws_ecs_cluster.main.arn]
    }
  }

  statement {
    sid       = "EcsTasks"
    actions   = ["ecs:DescribeTasks", "ecs:StopTask"]
    resources = ["arn:aws:ecs:${var.region}:${local.account_id}:task/${aws_ecs_cluster.main.name}/*"]
  }

  # タスクに渡せるロールは、2 つだけ(ECS のタスクとしてだけ)
  statement {
    sid       = "PassTaskRoles"
    actions   = ["iam:PassRole"]
    resources = [aws_iam_role.task_execution.arn, aws_iam_role.task.arn]

    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["ecs-tasks.amazonaws.com"]
    }
  }

  # マイグレーションが失敗したときに、ログを見られるようにする
  statement {
    sid       = "ReadLogs"
    actions   = ["logs:GetLogEvents"]
    resources = ["${aws_cloudwatch_log_group.app.arn}:*"]
  }

  statement {
    sid       = "FrontendBucketList"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.frontend.arn]
  }

  statement {
    sid       = "FrontendBucketWrite"
    actions   = ["s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.frontend.arn}/*"]
  }

  statement {
    sid       = "CloudFrontInvalidate"
    actions   = ["cloudfront:CreateInvalidation", "cloudfront:GetInvalidation"]
    resources = [aws_cloudfront_distribution.main.arn]
  }
}

resource "aws_iam_role_policy" "github_deploy" {
  name   = "deploy"
  role   = aws_iam_role.github_deploy.id
  policy = data.aws_iam_policy_document.github_deploy.json
}

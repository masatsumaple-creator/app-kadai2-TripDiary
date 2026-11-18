# Terraform の state(状態ファイル)を置く S3 バケットを作る。最初に 1 回だけ実行する。
#
# このディレクトリ自体の state は、ローカルに置く(まだ、置き場所がないため)。
# 作られるのは、バケット 1 つだけ(数円/月)。本体(infra/)の `terraform destroy` では消えない。
# アカウント ID は、リポジトリに書かず、実行時に取得してバケット名に使う(S3 のバケット名は、全体で一意が必要)。

terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

variable "region" {
  type    = string
  default = "ap-northeast-1"
}

variable "project" {
  type    = string
  default = "tripdiary"
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project   = var.project
      ManagedBy = "terraform"
    }
  }
}

data "aws_caller_identity" "current" {}

resource "aws_s3_bucket" "tfstate" {
  bucket = "${var.project}-tfstate-${data.aws_caller_identity.current.account_id}"

  # state を消さないため、中身があるときは、バケットを消せない(destroy が失敗する)。
  # 最後に消すときは、手順書(infra/README.md)のとおりに、中身を空にしてから消す
  force_destroy = false
}

# 過去の state に戻せるように、バージョニングを有効にする
resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  versioning_configuration {
    status = "Enabled"
  }
}

# state には、生成した秘密情報(JWT の鍵など)が入るため、暗号化する
resource "aws_s3_bucket_server_side_encryption_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# 公開しない
resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

output "state_bucket" {
  description = "本体(infra/)の backend.hcl に書くバケット名"
  value       = aws_s3_bucket.tfstate.bucket
}

output "region" {
  value = var.region
}

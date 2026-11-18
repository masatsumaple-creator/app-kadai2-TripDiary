terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # state は S3 に置く。バケット名は、backend.hcl(gitignore)で渡す:
  #   terraform init -backend-config=backend.hcl
  # use_lockfile は、S3 の機能で state をロックする(Terraform 1.10 以降。DynamoDB は不要)
  backend "s3" {
    key          = "tripdiary/terraform.tfstate"
    use_lockfile = true
    encrypt      = true
  }
}

provider "aws" {
  region = var.region

  # すべてのリソースに付ける。請求の画面で、このプロジェクトの費用だけを見るためにも使う
  default_tags {
    tags = {
      Project   = var.project
      ManagedBy = "terraform"
    }
  }
}

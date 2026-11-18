# 秘密情報(docs/22_インフラ設計.md の 3.2)
#
# - DB のマスター認証情報は、RDS が Secrets Manager に作る(rds.tf の manage_master_user_password)
# - JWT_SECRET(アクセストークンの署名鍵)は、ここで生成して保管する。
#   生成した値は state に入る。state のバケットは暗号化・非公開・バージョニング済み

resource "random_password" "jwt_secret" {
  length  = 64
  special = false
}

resource "aws_secretsmanager_secret" "jwt_secret" {
  name = "${var.project}/jwt-secret"

  # 使い捨て運用のため、destroy で、すぐに完全に消す(既定は 30 日間の削除待ち。同じ名前で作り直せなくなる)
  recovery_window_in_days = 0

  tags = { Name = "${var.project}-jwt-secret" }
}

resource "aws_secretsmanager_secret_version" "jwt_secret" {
  secret_id     = aws_secretsmanager_secret.jwt_secret.id
  secret_string = random_password.jwt_secret.result
}

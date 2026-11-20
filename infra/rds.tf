# データベース(docs/22_インフラ設計.md の D2・D9、3.2)
#
# - RDS MySQL 8.4、db.t4g.micro、シングル AZ、gp3 20GB。プライベートサブネットに置く(インターネットへのルートがない)
# - マスターパスワードは RDS が作って Secrets Manager に保管する(manage_master_user_password)。Terraform の state には入らない
# - 使い捨て運用のため、削除保護なし・最終スナップショットなし(destroy できれいに消える)

resource "aws_db_subnet_group" "main" {
  name       = "${var.project}-db"
  subnet_ids = aws_subnet.private[*].id

  tags = { Name = "${var.project}-db" }
}

# 文字コードを utf8mb4 にする(日本語・絵文字を扱うため)
resource "aws_db_parameter_group" "main" {
  name   = "${var.project}-mysql84"
  family = "mysql8.4"

  parameter {
    name  = "character_set_server"
    value = "utf8mb4"
  }

  parameter {
    name  = "collation_server"
    value = "utf8mb4_0900_ai_ci"
  }

  # TLS(暗号化)でない接続を、サーバー側で拒否する(アプリは、AWS 公式の CA の証明書で、サーバーを検証して接続する)
  parameter {
    name  = "require_secure_transport"
    value = "1"
  }

  tags = { Name = "${var.project}-mysql84" }
}

resource "aws_db_instance" "main" {
  identifier = "${var.project}-db"

  engine         = "mysql"
  engine_version = "8.4"
  instance_class = "db.t4g.micro"

  allocated_storage = 20
  storage_type      = "gp3"
  storage_encrypted = true

  db_name  = "tripdiary"
  username = "tripdiary_admin"

  # パスワードは RDS が生成し、Secrets Manager に保管する(state に入らない)
  manage_master_user_password = true

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.db.id]
  parameter_group_name   = aws_db_parameter_group.main.name
  publicly_accessible    = false
  multi_az               = false

  backup_retention_period = 1
  deletion_protection     = false
  skip_final_snapshot     = true
  apply_immediately       = true

  tags = { Name = "${var.project}-db" }
}

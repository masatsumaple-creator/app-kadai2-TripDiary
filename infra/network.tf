# ネットワーク(docs/22_インフラ設計.md の 2 章・3.1)
#
# - NAT Gateway とインターフェイス型 VPC エンドポイントは置かない(要件。固定費が大きいため)
# - Fargate はパブリックサブネットに置き、公開 IP を付ける(受信は、ALB のセキュリティグループからだけ許可する)
# - ALB(内部)と RDS は、プライベートサブネットに置く(インターネットへのルートがない)

data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  azs = [for s in var.az_suffixes : "${var.region}${s}"]
}

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = { Name = "${var.project}-vpc" }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = { Name = "${var.project}-igw" }
}

# パブリック: 10.0.0.0/24、10.0.1.0/24 …  プライベート: 10.0.10.0/24、10.0.11.0/24 …
resource "aws_subnet" "public" {
  count = length(local.azs)

  vpc_id            = aws_vpc.main.id
  availability_zone = local.azs[count.index]
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index)

  # 公開 IP は、Fargate のタスク側で付ける(assign_public_ip)。サブネットでは自動で付けない
  map_public_ip_on_launch = false

  tags = { Name = "${var.project}-public-${var.az_suffixes[count.index]}" }
}

resource "aws_subnet" "private" {
  count = length(local.azs)

  vpc_id            = aws_vpc.main.id
  availability_zone = local.azs[count.index]
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index + 10)

  tags = { Name = "${var.project}-private-${var.az_suffixes[count.index]}" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  tags = { Name = "${var.project}-public" }
}

resource "aws_route" "public_internet" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.main.id
}

# プライベートのルートテーブルには、0.0.0.0/0 のルートを作らない(インターネットへ出られない)
resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id

  tags = { Name = "${var.project}-private" }
}

resource "aws_route_table_association" "public" {
  count = length(aws_subnet.public)

  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "private" {
  count = length(aws_subnet.private)

  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

# S3 のゲートウェイエンドポイント(無料)。ECR のイメージの実体は S3 にあるため、
# NAT がなくても、イメージの取得が S3 まで、VPC の中を通る
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${var.region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_route_table.public.id, aws_route_table.private.id]

  tags = { Name = "${var.project}-s3" }
}

# ---- セキュリティグループ -------------------------------------------------
# ルールは、グループ同士を参照する形で、別のリソース(aws_vpc_security_group_*_rule)として書く。
# ALB の受信ルール(CloudFront の VPC オリジンの管理グループから)は、CloudFront を作る段階(L4)で足す

resource "aws_security_group" "alb" {
  name        = "${var.project}-alb"
  description = "Internal ALB (reached from the CloudFront VPC origin)"
  vpc_id      = aws_vpc.main.id

  tags = { Name = "${var.project}-alb" }
}

resource "aws_security_group" "app" {
  name        = "${var.project}-app"
  description = "ECS Fargate tasks (NestJS)"
  vpc_id      = aws_vpc.main.id

  tags = { Name = "${var.project}-app" }
}

resource "aws_security_group" "db" {
  name        = "${var.project}-db"
  description = "RDS MySQL"
  vpc_id      = aws_vpc.main.id

  tags = { Name = "${var.project}-db" }
}

# ALB → アプリ(3000)
resource "aws_vpc_security_group_egress_rule" "alb_to_app" {
  security_group_id            = aws_security_group.alb.id
  referenced_security_group_id = aws_security_group.app.id
  ip_protocol                  = "tcp"
  from_port                    = 3000
  to_port                      = 3000
  description                  = "ALB to app"
}

resource "aws_vpc_security_group_ingress_rule" "app_from_alb" {
  security_group_id            = aws_security_group.app.id
  referenced_security_group_id = aws_security_group.alb.id
  ip_protocol                  = "tcp"
  from_port                    = 3000
  to_port                      = 3000
  description                  = "From ALB only"
}

# アプリ → インターネット(443): ECR・Secrets Manager・CloudWatch Logs への接続。NAT がないため、公開 IP から直接出る
resource "aws_vpc_security_group_egress_rule" "app_https" {
  security_group_id = aws_security_group.app.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  description       = "HTTPS to AWS APIs (ECR, Secrets Manager, Logs)"
}

# アプリ → DB(3306)
resource "aws_vpc_security_group_egress_rule" "app_to_db" {
  security_group_id            = aws_security_group.app.id
  referenced_security_group_id = aws_security_group.db.id
  ip_protocol                  = "tcp"
  from_port                    = 3306
  to_port                      = 3306
  description                  = "App to MySQL"
}

resource "aws_vpc_security_group_ingress_rule" "db_from_app" {
  security_group_id            = aws_security_group.db.id
  referenced_security_group_id = aws_security_group.app.id
  ip_protocol                  = "tcp"
  from_port                    = 3306
  to_port                      = 3306
  description                  = "From app only"
}

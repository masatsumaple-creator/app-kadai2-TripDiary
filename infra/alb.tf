# ロードバランサー(docs/22_インフラ設計.md の 3.1)
#
# - 内部 ALB(プライベートサブネット)。インターネットから直接は届かない
# - CloudFront からの受信ルール(VPC オリジン)は、CloudFront を作る段階(L4)で足す
# - ヘルスチェックは /api/health/live(DB に依存しない)。DB が一瞬つながらないだけで、タスクが入れ替わり続けないようにする

resource "aws_lb" "main" {
  name               = "${var.project}-alb"
  internal           = true
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.private[*].id

  tags = { Name = "${var.project}-alb" }
}

resource "aws_lb_target_group" "app" {
  name        = "${var.project}-app"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip" # Fargate(awsvpc)

  # タスクの入れ替えのとき、処理中のリクエストを待つ時間
  deregistration_delay = 30

  health_check {
    path                = "/api/health/live"
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  tags = { Name = "${var.project}-app" }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }
}

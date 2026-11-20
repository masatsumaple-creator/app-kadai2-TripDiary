# 配信(docs/22_インフラ設計.md の 3.2)
#
# - 画面(S3)と API(/api/* → 内部 ALB)を、同じドメインで配信する(同一オリジン。CORS が不要で、Cookie がそのまま動く)
# - ALB へは VPC オリジンで接続する。ALB を公開しない
# - 標準のドメイン(*.cloudfront.net)と標準の証明書を使う

# AWS が管理するキャッシュ・オリジンリクエストのポリシー
data "aws_cloudfront_cache_policy" "optimized" {
  name = "Managed-CachingOptimized"
}

data "aws_cloudfront_cache_policy" "disabled" {
  name = "Managed-CachingDisabled"
}

# Cookie・Authorization・クエリを、オリジンへ転送する(Host は転送しない)
data "aws_cloudfront_origin_request_policy" "all_viewer_except_host" {
  name = "Managed-AllViewerExceptHostHeader"
}

resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "${var.project}-frontend"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_vpc_origin" "alb" {
  vpc_origin_endpoint_config {
    name                   = "${var.project}-alb"
    arn                    = aws_lb.main.arn
    http_port              = 80
    https_port             = 443
    origin_protocol_policy = "http-only"

    origin_ssl_protocols {
      items    = ["TLSv1.2"]
      quantity = 1
    }
  }
}

# SPA のフォールバック: 拡張子のない URL(/spots/1 など)を /index.html に書き換える。
# カスタムエラーレスポンスは使わない(/api/* の 403・404 まで書き換えて、API のエラーが壊れるため)
resource "aws_cloudfront_function" "spa_fallback" {
  name    = "${var.project}-spa-fallback"
  runtime = "cloudfront-js-2.0"
  publish = true
  comment = "Rewrite extensionless paths to /index.html"

  code = <<-EOT
    function handler(event) {
      var request = event.request;
      var last = request.uri.split('/').pop();
      if (last.indexOf('.') === -1) {
        request.uri = '/index.html';
      }
      return request;
    }
  EOT
}

# CSP(ブラウザの読み込み制限)の内容。許可するのは、このサイト・写真のバケット(S3)・地図(Amazon Location)・Cognito だけ
locals {
  csp = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://${aws_s3_bucket.photos.bucket_regional_domain_name}; connect-src 'self' https://${aws_s3_bucket.photos.bucket_regional_domain_name} https://maps.geo.${var.region}.amazonaws.com https://cognito-identity.${var.region}.amazonaws.com; worker-src 'self' blob:; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
}

# セキュリティヘッダー。CSP は、変数 csp_enforce で、本適用か、違反を報告するだけ(Report-Only)かを切り替える(既定は本適用)。
# 画面が壊れたときは、-var csp_enforce=false で、すぐに Report-Only に戻せる。
# ※ 本適用の CSP は、CloudFront では、カスタムヘッダーではなく、専用の設定(content_security_policy)で指定する
#   (カスタムヘッダーに Content-Security-Policy を書くと、400 で作れない)。Report-Only は、カスタムヘッダーで指定できる
resource "aws_cloudfront_response_headers_policy" "security" {
  name = "${var.project}-security-headers"

  security_headers_config {
    strict_transport_security {
      access_control_max_age_sec = 63072000
      include_subdomains         = true
      preload                    = false
      override                   = true
    }

    content_type_options {
      override = true
    }

    frame_options {
      frame_option = "DENY"
      override     = true
    }

    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }

    dynamic "content_security_policy" {
      for_each = var.csp_enforce ? [1] : []

      content {
        content_security_policy = local.csp
        override                = true
      }
    }
  }

  custom_headers_config {
    items {
      header   = "Permissions-Policy"
      value    = "geolocation=(self), camera=(), microphone=()"
      override = true
    }

    dynamic "items" {
      for_each = var.csp_enforce ? [] : [1]

      content {
        header   = "Content-Security-Policy-Report-Only"
        value    = local.csp
        override = true
      }
    }
  }
}

resource "aws_cloudfront_distribution" "main" {
  enabled             = true
  comment             = var.project
  default_root_object = "index.html"
  price_class         = "PriceClass_100"
  http_version        = "http2and3"
  is_ipv6_enabled     = true

  origin {
    origin_id                = "s3-frontend"
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  origin {
    origin_id   = "alb-api"
    domain_name = aws_lb.main.dns_name

    vpc_origin_config {
      vpc_origin_id = aws_cloudfront_vpc_origin.alb.id
    }
  }

  # 既定: 画面(S3)
  default_cache_behavior {
    target_origin_id       = "s3-frontend"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    cache_policy_id            = data.aws_cloudfront_cache_policy.optimized.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.spa_fallback.arn
    }
  }

  # /api/*: ALB(キャッシュなし。全メソッド。Cookie・Authorization・クエリを転送)
  ordered_cache_behavior {
    path_pattern           = "/api/*"
    target_origin_id       = "alb-api"
    viewer_protocol_policy = "https-only"
    allowed_methods        = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    cache_policy_id            = data.aws_cloudfront_cache_policy.disabled.id
    origin_request_policy_id   = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = { Name = var.project }
}

# ALB の受信: CloudFront の VPC オリジン(AWS が VPC に作る管理用のセキュリティグループ)から、80 番だけ許可する
data "aws_security_group" "cloudfront_vpc_origin" {
  vpc_id = aws_vpc.main.id

  filter {
    name   = "group-name"
    values = ["CloudFront-VPCOrigins-Service-SG"]
  }

  depends_on = [aws_cloudfront_vpc_origin.alb]
}

resource "aws_vpc_security_group_ingress_rule" "alb_from_cloudfront" {
  security_group_id            = aws_security_group.alb.id
  referenced_security_group_id = data.aws_security_group.cloudfront_vpc_origin.id
  ip_protocol                  = "tcp"
  from_port                    = 80
  to_port                      = 80
  description                  = "From CloudFront VPC origin"
}

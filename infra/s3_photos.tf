# 写真の置き場(docs/22_インフラ設計.md の 3.3、docs/20_設計書.md の「写真」)
#
# - 非公開。ブラウザは、API が発行した署名付き URL で、S3 へ直接アップロード・取得する(画像は、サーバーを通らない)
# - 署名付き URL は、タスクロールの権限で署名される。バケットは、そのロールにだけ権限を与える
# - 使い捨て運用のため、中身が残っていても destroy で消せる(force_destroy)

resource "aws_s3_bucket" "photos" {
  bucket        = "${var.project}-photos-${data.aws_caller_identity.current.account_id}"
  force_destroy = true

  tags = { Name = "${var.project}-photos" }
}

resource "aws_s3_bucket_public_access_block" "photos" {
  bucket = aws_s3_bucket.photos.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "photos" {
  bucket = aws_s3_bucket.photos.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# 途中で止まったアップロードの残りを、1 日後に消す(保管料を抑える)
resource "aws_s3_bucket_lifecycle_configuration" "photos" {
  bucket = aws_s3_bucket.photos.id

  rule {
    id     = "abort-incomplete-multipart-uploads"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

# ブラウザから直接アップロード(PUT)・取得(GET)するため、CORS が要る。
# 許可するのは、このサイト(CloudFront のドメイン)だけ
resource "aws_s3_bucket_cors_configuration" "photos" {
  bucket = aws_s3_bucket.photos.id

  cors_rule {
    allowed_origins = ["https://${aws_cloudfront_distribution.main.domain_name}"]
    allowed_methods = ["GET", "HEAD", "PUT"]
    allowed_headers = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

# アプリ(タスクロール)に、写真の操作だけを許可する。
# ListBucket が要る理由: 画像がないとき、HeadObject が、404(ない)ではなく 403 になって、
# 「アップロードが確認できない」と区別できなくなるため
data "aws_iam_policy_document" "task_photos" {
  statement {
    sid       = "PhotoObjects"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.photos.arn}/*"]
  }

  statement {
    sid       = "PhotoBucketList"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.photos.arn]
  }
}

resource "aws_iam_role_policy" "task_photos" {
  name   = "photos"
  role   = aws_iam_role.task.id
  policy = data.aws_iam_policy_document.task_photos.json
}

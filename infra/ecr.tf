# バックエンドのコンテナイメージの置き場

resource "aws_ecr_repository" "backend" {
  name = "${var.project}-backend"

  # タグを上書きできない。イメージには、git の SHA を付ける(どのコードかが、いつも分かる)
  image_tag_mutability = "IMMUTABLE"

  # 使い捨て運用のため、イメージが残っていても、destroy で消せるようにする
  force_delete = true

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }
}

# 古いイメージを残しすぎない(保管料を抑える)
resource "aws_ecr_lifecycle_policy" "backend" {
  repository = aws_ecr_repository.backend.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the latest 10 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = { type = "expire" }
    }]
  })
}

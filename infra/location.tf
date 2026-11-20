# 地図(docs/22_インフラ設計.md の 3.3、docs/20_設計書.md の「地図」)
#
# - 地図(Amazon Location Service の Maps v2)の表示は、ブラウザが、Cognito の「未ログイン用の一時的な認証情報」で行う。
#   許可するのは、地図の表示に必要な操作だけ(下の map_unauth ロール)
#   ※ API キーは、AWS プロバイダーに管理用のリソースがなく、Terraform で作って消せないため、使わない
# - 住所の取得(逆ジオコーディング)は、ブラウザではなく、バックエンド(タスクロール)が呼ぶ。
#   ログイン済みのユーザーだけが使えるようにして、ブラウザには、この権限を持たせない

locals {
  location_maps_arn   = "arn:aws:geo-maps:${var.region}::provider/default"
  location_places_arn = "arn:aws:geo-places:${var.region}::provider/default"
}

resource "aws_cognito_identity_pool" "map" {
  identity_pool_name = "${var.project}-map"

  # ログインしていない人にも、地図を見せる(認証情報は、地図の表示だけの権限)
  allow_unauthenticated_identities = true
  allow_classic_flow               = false
}

data "aws_iam_policy_document" "map_unauth_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = ["cognito-identity.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "cognito-identity.amazonaws.com:aud"
      values   = [aws_cognito_identity_pool.map.id]
    }

    condition {
      test     = "ForAnyValue:StringLike"
      variable = "cognito-identity.amazonaws.com:amr"
      values   = ["unauthenticated"]
    }
  }
}

resource "aws_iam_role" "map_unauth" {
  name               = "${var.project}-map-unauth"
  assume_role_policy = data.aws_iam_policy_document.map_unauth_assume.json
}

# 地図の表示(スタイル・タイル・文字・アイコン)だけ。逆ジオコーディングなどの、ほかの操作は許可しない
data "aws_iam_policy_document" "map_unauth" {
  statement {
    sid = "RenderMap"
    actions = [
      "geo-maps:GetStyleDescriptor",
      "geo-maps:GetTile",
      "geo-maps:GetGlyphs",
      "geo-maps:GetSprites",
    ]
    resources = [local.location_maps_arn]
  }
}

resource "aws_iam_role_policy" "map_unauth" {
  name   = "render-map"
  role   = aws_iam_role.map_unauth.id
  policy = data.aws_iam_policy_document.map_unauth.json
}

resource "aws_cognito_identity_pool_roles_attachment" "map" {
  identity_pool_id = aws_cognito_identity_pool.map.id

  roles = {
    unauthenticated = aws_iam_role.map_unauth.arn
  }
}

# バックエンド(タスクロール)に、逆ジオコーディングだけを許可する
data "aws_iam_policy_document" "task_places" {
  statement {
    sid       = "ReverseGeocode"
    actions   = ["geo-places:ReverseGeocode"]
    resources = [local.location_places_arn]
  }
}

resource "aws_iam_role_policy" "task_places" {
  name   = "places"
  role   = aws_iam_role.task.id
  policy = data.aws_iam_policy_document.task_places.json
}

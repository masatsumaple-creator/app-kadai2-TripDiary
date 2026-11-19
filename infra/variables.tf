variable "region" {
  description = "リージョン(docs/22_インフラ設計.md の D1)"
  type        = string
  default     = "ap-northeast-1"
}

variable "project" {
  description = "リソース名の接頭辞とタグ"
  type        = string
  default     = "tripdiary"
}

variable "vpc_cidr" {
  type    = string
  default = "10.0.0.0/16"
}

variable "az_suffixes" {
  description = "使うアベイラビリティゾーン(リージョン名の後ろの文字)。東京は a・c・d がある"
  type        = list(string)
  default     = ["a", "c"]
}

variable "budget_usd" {
  description = "予算(米ドル)。実績が 100% と 125% に達したらメールで通知する(docs/22_インフラ設計.md の D4: 約 $20 で、$20 と $25 に通知)"
  type        = number
  default     = 20
}

variable "budget_alert_email" {
  description = "予算の通知先のメールアドレス。個人情報のため、既定値は持たず、terraform.tfvars(gitignore)か環境変数 TF_VAR_budget_alert_email で渡す"
  type        = string
  sensitive   = true
}

variable "image_tag" {
  description = "最初に起動するバックエンドのイメージのタグ(ECR。git の SHA)。以降の更新は、デプロイの CI がタスク定義を差し替える"
  type        = string
  default     = "bootstrap"
}

variable "github_repository" {
  description = "デプロイを許可する GitHub のリポジトリ(オーナー/名前)。このリポジトリの main ブランチからの実行だけを信頼する"
  type        = string
  default     = "masatsumaple-creator/app-kadai2-TripDiary"
}

variable "github_oidc_subject_prefix" {
  description = "GitHub の OIDC トークンの sub の接頭辞。リポジトリが「不変のサブジェクト」(オーナーとリポジトリの ID を使う形式)を使う場合は、その値を指定する。確認: gh api repos/<オーナー>/<リポジトリ>/actions/oidc/customization/sub の sub_claim_prefix(ID は公開情報で、秘密情報ではない)。空のときは repo:<github_repository>(名前の形式)"
  type        = string
  default     = "repo:masatsumaple-creator@325277161/app-kadai2-TripDiary@1457659476"
}

variable "create_github_oidc_provider" {
  description = "GitHub の OIDC プロバイダーを作るか。1 つの AWS アカウントに作れるのは 1 つだけなので、すでにあるアカウントでは false にする"
  type        = bool
  default     = true
}

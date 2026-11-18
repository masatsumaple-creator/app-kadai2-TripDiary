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

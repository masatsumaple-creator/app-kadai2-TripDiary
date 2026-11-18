# 予算のアラート(docs/22_インフラ設計.md の 5.5)
#
# 通知だけで、自動では止めない。消し忘れ・想定外の課金に、早く気づくための仕組み。
# 実績が予算の 100%(= $20)と 125%(= $25)に達したら、メールで通知する。
# あわせて、予測が 100% を超えそうなときにも、早めに通知する。
#
# この予算は、アカウント全体の費用を対象にする(タグでの絞り込みには、コスト配分タグの有効化が必要なため)

resource "aws_budgets_budget" "monthly" {
  name         = "${var.project}-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.budget_alert_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 125
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.budget_alert_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.budget_alert_email]
  }
}

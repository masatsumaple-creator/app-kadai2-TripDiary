# infra(AWS・Terraform)

TripDiary を AWS にデプロイするための Terraform。設計は `docs/22_インフラ設計.md`。

- **使い捨て運用**: 使うときだけ作って、終わったら `terraform destroy` で消す(確認期間は 1 週間。詳しくは設計書の 10 章)。
- **このディレクトリのコードが触るのは、`Project=tripdiary` のタグが付いたリソースだけ。** 同じアカウントの RaiseTimeLine のリソース(`raisetimeline-*`)には触らない。
- **認証情報・state・個人情報(メールアドレス・アカウント ID)は、コミットしない**(`.gitignore` で除外している)。リポジトリは公開されている。

## 層(段階)

| 層 | ファイル | 費用 |
|---|---|---|
| L1 | `bootstrap/`、`versions.tf`、`variables.tf`、`network.tf`、`ecr.tf`、`budgets.tf` | ほぼ無料(IPv4 を付けるまで) |
| L2 | `rds.tf`、`secrets.tf` | **RDS が課金開始**(確認済み。確認後は同日 destroy) |
| L3 | `alb.tf`、`ecs.tf`、`iam.tf` | **ALB・Fargate・公開 IPv4 が課金開始**(確認済み。確認後は同日 destroy) |
| L4 | `s3_frontend.tf`、`cloudfront.tf` | ほぼ無料(確認済み。確認後は同日 destroy) |
| L5 | `github_oidc.tf`(+ `.github/workflows/deploy.yml`、`scripts/set-github-variables.mjs`) | なし |
| L6 | `s3_photos.tf`(写真)、`location.tf`(地図: Cognito の ID プール・ロール、住所の取得の権限) | ほぼ無料(利用に応じて、少額) |
| 強化 | `rds.tf`(TLS を必須に)、`ecs.tf`(`DB_SSL_CA_FILE`・`TRUST_PROXY`)、`cloudfront.tf`(CSP の本適用。変数 `csp_enforce`) | なし |

## 前提

- Terraform 1.10 以上(state のロックに `use_lockfile` を使うため)、AWS CLI。
- AWS の認証情報(既定のプロファイルか、`AWS_PROFILE`)。リージョンは ap-northeast-1。
- 予算の通知先のメールアドレス: `TF_VAR_budget_alert_email` に設定するか、`terraform.tfvars`(gitignore)に書く。

## 初回(state のバケットを作る。1 回だけ)

```bash
cd infra/bootstrap
terraform init
terraform apply          # バケット `tripdiary-tfstate-<アカウント ID>` を作る
terraform output state_bucket
```

## 作る

```bash
cd infra
cp backend.hcl.example backend.hcl   # バケット名を、上の出力に書き換える
terraform init -backend-config=backend.hcl
terraform fmt -check && terraform validate
terraform plan -out=tfplan           # 作られるものを確認する
terraform apply tfplan
```

### GitHub Actions でデプロイする(L5 以降。通常はこちら)

環境を作る(`terraform apply`)と、ECS のサービスは、まだ ECR にないイメージ(`bootstrap`)を取りに行って失敗し続ける。**次の手順で、デプロイのワークフローが、イメージのビルド・マイグレーション・サービスの更新・フロントの配置までを行う**:

```bash
# 1. GitHub のリポジトリの「変数」を、作った環境の値に更新する(ロールの ARN、CloudFront のドメインなど。秘密情報ではない)
node scripts/set-github-variables.mjs
# 2. ワークフローを実行する(Actions の画面の「Deploy」→ Run workflow、または):
gh workflow run deploy.yml --ref main
gh run watch
```

- 入力は 3 つ(バックエンド・マイグレーション・フロント。既定は、すべて実行)。同時に 1 つだけ動く。
- ワークフローは、`main` ブランチからだけ動く。AWS のロールの信頼も、このリポジトリの `main` だけ(GitHub OIDC。長期のアクセスキーは使わない)。
- 最後に、CloudFront の URL で、画面・`/api/health/live`・`/api/health` の疎通を確認する。
- **OIDC のトークンの `sub`**: このリポジトリは、GitHub の「不変のサブジェクト」(オーナーとリポジトリの ID を使う形式。リポジトリ名を変えられても、同じ名前を取られても、信頼が移らない)が有効なため、`sub` が `repo:<オーナー>@<ID>/<リポジトリ>@<ID>:ref:refs/heads/main` の形になる。変数 `github_oidc_subject_prefix` の既定値に、その接頭辞を入れてある(確認: `gh api repos/<オーナー>/<リポジトリ>/actions/oidc/customization/sub` の `sub_claim_prefix`。ID は公開情報)。**別のリポジトリで使うときは、この値を変える**(名前の形式なら、空にする)。ロールを引き受けられないときは、まずここを疑う。
- 1 つの AWS アカウントに作れる GitHub の OIDC プロバイダーは 1 つだけ。すでにあるアカウントでは、`-var create_github_oidc_provider=false` を付ける。

### 手動で、最初のイメージを push する(GitHub Actions を使えないとき)

ECS のサービスは、ECR にイメージがないと起動できない。**apply の前に**、ARM64 のイメージを push する(以降の更新は、デプロイの CI が行う):

```bash
ACC=$(aws sts get-caller-identity --query Account --output text)
REPO=$ACC.dkr.ecr.ap-northeast-1.amazonaws.com
SHA=$(git rev-parse --short HEAD)
aws ecr get-login-password --region ap-northeast-1 | docker login --username AWS --password-stdin $REPO
docker buildx build --platform linux/arm64 --provenance=false -t $REPO/tripdiary-backend:$SHA --push backend
export TF_VAR_image_tag=$SHA        # plan・apply で、このタグを使う
```

apply の後、**マイグレーションを 1 回限りのタスクで実行**する(空の DB にテーブルを作る。終了コード 0 を確認する)。サブネットと SG の ID は `terraform output` で分かる:

```bash
aws ecs run-task --cluster tripdiary --launch-type FARGATE --task-definition tripdiary-backend \
  --network-configuration "awsvpcConfiguration={subnets=[<公開サブネット>],securityGroups=[<app の SG>],assignPublicIp=ENABLED}" \
  --overrides '{"containerOverrides":[{"name":"backend","command":["npx","prisma","migrate","deploy"]}]}'
aws ecs wait tasks-stopped --cluster tripdiary --tasks <タスクの ARN>
# ログ: aws logs tail /ecs/tripdiary --since 15m  (Git Bash では、先頭に MSYS_NO_PATHCONV=1 を付ける)
```

### フロントの配置(L4 以降)

本番用にビルドして、S3 に置く(通常は、デプロイのワークフローが行う)。地図の表示には、`NUXT_PUBLIC_MAP_IDENTITY_POOL_ID`(`terraform output` の `github_actions_variables` の `MAP_IDENTITY_POOL_ID`)を、ビルドのときに渡す。CloudFront の URL は `terraform output cloudfront_domain_name`:

```bash
(cd frontend && NUXT_PUBLIC_MAP_IDENTITY_POOL_ID=<ID プール> NUXT_PUBLIC_MAP_REGION=ap-northeast-1 npm run generate)
aws s3 sync frontend/.output/public s3://$(terraform -chdir=infra output -raw frontend_bucket) --delete
# 作り直しのあとは不要。内容を更新したときは、キャッシュを無効にする:
aws cloudfront create-invalidation --distribution-id $(terraform -chdir=infra output -raw cloudfront_distribution_id) --paths "/*"
```

## 消す

```bash
cd infra
terraform destroy                    # state のバケット以外を、すべて消す
```

消した後は、何も残っていないことを確認する。**タグでの検索は、索引の更新が遅れて、すでにないリソースが残って見えることがある**ため、
タグでの検索だけに頼らず、サービスごとに直接確認する(**課金されるもの**を、必ず確認する):

```bash
R="--region ap-northeast-1"
aws ecs list-clusters $R --query 'clusterArns'                                   # ECS(空であること)
aws rds describe-db-instances $R --query 'DBInstances[].DBInstanceIdentifier'    # RDS
aws elbv2 describe-load-balancers $R --query 'LoadBalancers[].LoadBalancerName'  # ALB
aws ec2 describe-nat-gateways $R --filter Name=state,Values=available,pending --query 'NatGateways[].NatGatewayId'
aws ec2 describe-addresses $R --query 'Addresses[].PublicIp'                     # Elastic IP
aws cloudfront list-distributions --query 'DistributionList.Items[].Id'          # CloudFront
aws ecr describe-repositories $R --query 'repositories[].repositoryName'         # ECR
aws secretsmanager list-secrets $R --query 'SecretList[].Name'                   # Secrets Manager
aws logs describe-log-groups $R --query 'logGroups[].logGroupName'               # CloudWatch Logs
aws ec2 describe-vpcs $R --filters Name=isDefault,Values=false --query 'Vpcs[].VpcId'
aws s3api list-buckets --query "Buckets[?starts_with(Name, 'tripdiary-')].Name"  # state 以外が残っていないこと
```

(同じアカウントに RaiseTimeLine の `raisetimeline-*` のバケットがあるが、これは対象外。)

state のバケット(`bootstrap/`)は、数円/月なので、通常は残す。完全に片付けるときは、バケットの中身(バージョンを含む)を空にしてから、`cd infra/bootstrap && terraform destroy` を実行する。

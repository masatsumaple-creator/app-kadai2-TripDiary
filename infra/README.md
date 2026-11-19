# infra(AWS・Terraform)

TripDiary を AWS にデプロイするための Terraform。設計は `docs/22_インフラ設計.md`。

- **使い捨て運用**: 使うときだけ作って、終わったら `terraform destroy` で消す(講師の確認期間は 1 週間。詳しくは設計書の 10 章)。
- **このディレクトリのコードが触るのは、`Project=tripdiary` のタグが付いたリソースだけ。** 同じアカウントの RaiseTimeLine のリソース(`raisetimeline-*`)には触らない。
- **認証情報・state・個人情報(メールアドレス・アカウント ID)は、コミットしない**(`.gitignore` で除外している)。リポジトリは公開されている。

## 層(段階)

| 層 | ファイル | 費用 |
|---|---|---|
| L1 | `bootstrap/`、`versions.tf`、`variables.tf`、`network.tf`、`ecr.tf`、`budgets.tf` | ほぼ無料(IPv4 を付けるまで) |
| L2 | `rds.tf`、`secrets.tf` | **RDS が課金開始**(確認済み。確認後は同日 destroy) |
| L3 | `alb.tf`、`ecs.tf`、`iam.tf` | **ALB・Fargate・公開 IPv4 が課金開始**(確認済み。確認後は同日 destroy) |
| L4 | `s3_frontend.tf`、`cloudfront.tf` | ほぼ無料(確認済み。確認後は同日 destroy) |
| L5 | `github_oidc.tf`(+ `.github/workflows/deploy.yml`) | なし |

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

### 最初のイメージと、マイグレーション(L3 以降)

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

本番用にビルド(**`HIDE_MOCK=true`** で、ダミーの画面 `/mock`・`/map` を外す)し、S3 に置く。CloudFront の URL は `terraform output cloudfront_domain_name`:

```bash
(cd frontend && HIDE_MOCK=true npm run generate)
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

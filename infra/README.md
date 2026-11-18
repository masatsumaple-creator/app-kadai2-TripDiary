# infra(AWS・Terraform)

TripDiary を AWS にデプロイするための Terraform。設計は `docs/22_インフラ設計.md`。

- **使い捨て運用**: 使うときだけ作って、終わったら `terraform destroy` で消す(講師の確認期間は 1 週間。詳しくは設計書の 10 章)。
- **このディレクトリのコードが触るのは、`Project=tripdiary` のタグが付いたリソースだけ。** 同じアカウントの RaiseTimeLine のリソース(`raisetimeline-*`)には触らない。
- **認証情報・state・個人情報(メールアドレス・アカウント ID)は、コミットしない**(`.gitignore` で除外している)。リポジトリは公開されている。

## 層(段階)

| 層 | ファイル | 費用 |
|---|---|---|
| L1 | `bootstrap/`、`versions.tf`、`variables.tf`、`network.tf`、`ecr.tf`、`budgets.tf` | ほぼ無料(IPv4 を付けるまで) |
| L2 | `rds.tf`、`secrets.tf` | **RDS が課金開始** |
| L3 | `alb.tf`、`ecs.tf`、`iam.tf` | **ALB・Fargate・公開 IPv4 が課金開始** |
| L4 | `s3_frontend.tf`、`cloudfront.tf` | ほぼ無料 |
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

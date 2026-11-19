// terraform destroy の後に、課金されるものが残っていないかを、AWS CLI で確認する(docs/22_インフラ設計.md の O6)。
//   node scripts/cleanup-check.mjs
// 前提: aws(AWS CLI)でログイン済み。リージョンは、環境変数 AWS_REGION(既定は ap-northeast-1)。
// 終了コード: 0 = 課金されるものはない / 1 = 残っているものがある。
//
// タグでの検索(Resource Groups Tagging API)は、索引の更新が遅れて、すでにないものが残って見えることがあるため使わない。
// サービスごとに、直接確認する。他のプロジェクトのリソースは、名前の接頭辞(tripdiary)・タグ(Project=tripdiary)で除く。
import { execFileSync } from 'node:child_process';

const region = process.env.AWS_REGION || 'ap-northeast-1';
const project = 'tripdiary';
const exe = (name) => (process.platform === 'win32' ? `${name}.exe` : name);

function aws(args) {
  const out = execFileSync(exe('aws'), [...args, '--region', region, '--output', 'json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return out.trim() ? JSON.parse(out) : null;
}

const tagFilter = { Name: 'tag:Project', Values: [project] };
const filters = (...f) => ['--filters', ...f.map((x) => `Name=${x.Name},Values=${x.Values.join(',')}`)];
const byPrefix = (names) => names.filter((n) => n.startsWith(project));

// [表示名, 確認の関数(残っているものの一覧を返す)]
const billable = [
  ['RDS(データベース)', () => aws(['rds', 'describe-db-instances']).DBInstances.map((d) => d.DBInstanceIdentifier).filter((n) => n.startsWith(project))],
  ['RDS(手動のスナップショット)', () => aws(['rds', 'describe-db-snapshots', '--snapshot-type', 'manual']).DBSnapshots.map((s) => s.DBSnapshotIdentifier).filter((n) => n.startsWith(project))],
  ['ECS(クラスター)', () => {
    const arns = aws(['ecs', 'list-clusters']).clusterArns.filter((a) => a.endsWith(`/${project}`));
    if (arns.length === 0) return [];
    return aws(['ecs', 'describe-clusters', '--clusters', ...arns]).clusters.filter((c) => c.status === 'ACTIVE').map((c) => c.clusterName);
  }],
  ['ALB(ロードバランサー)', () => byPrefix(aws(['elbv2', 'describe-load-balancers']).LoadBalancers.map((l) => l.LoadBalancerName))],
  ['NAT ゲートウェイ', () => aws(['ec2', 'describe-nat-gateways', '--filter', 'Name=state,Values=pending,available', `Name=tag:Project,Values=${project}`]).NatGateways.map((n) => n.NatGatewayId)],
  ['Elastic IP(固定の公開 IP)', () => aws(['ec2', 'describe-addresses', ...filters(tagFilter)]).Addresses.map((a) => a.PublicIp)],
  ['EC2 インスタンス', () => aws(['ec2', 'describe-instances', ...filters(tagFilter, { Name: 'instance-state-name', Values: ['pending', 'running', 'stopping', 'stopped'] })]).Reservations.flatMap((r) => r.Instances.map((i) => i.InstanceId))],
  ['VPC エンドポイント(インターフェイス型)', () => aws(['ec2', 'describe-vpc-endpoints', ...filters(tagFilter)]).VpcEndpoints.filter((e) => e.VpcEndpointType !== 'Gateway').map((e) => e.VpcEndpointId)],
  ['CloudFront(ディストリビューション)', () => (aws(['cloudfront', 'list-distributions'])?.DistributionList?.Items ?? []).filter((d) => d.Comment === project).map((d) => d.Id)],
  ['CloudFront(VPC オリジン)', () => (aws(['cloudfront', 'list-vpc-origins'])?.VpcOriginList?.Items ?? []).map((o) => o.Id)],
  ['CloudFront(関数)', () => byPrefix((aws(['cloudfront', 'list-functions'])?.FunctionList?.Items ?? []).map((f) => f.Name))],
  ['Secrets Manager(シークレット)', () => byPrefix(aws(['secretsmanager', 'list-secrets']).SecretList.map((s) => s.Name))],
  ['CloudWatch Logs(ログのグループ)', () => aws(['logs', 'describe-log-groups', '--log-group-name-prefix', `/ecs/${project}`]).logGroups.map((g) => g.logGroupName)],
  ['S3(フロントのバケット)', () => aws(['s3api', 'list-buckets']).Buckets.map((b) => b.Name).filter((n) => n.startsWith(`${project}-frontend`))],
  ['IAM(ロール)', () => aws(['iam', 'list-roles']).Roles.map((r) => r.RoleName).filter((n) => n.startsWith(project))],
  ['IAM(GitHub の OIDC プロバイダー)', () => aws(['iam', 'list-open-id-connect-providers']).OpenIDConnectProviderList.map((p) => p.Arn).filter((a) => a.endsWith('token.actions.githubusercontent.com'))],
  ['RDS(パラメータグループ・サブネットグループ)', () => [
    ...aws(['rds', 'describe-db-parameter-groups']).DBParameterGroups.map((g) => g.DBParameterGroupName),
    ...aws(['rds', 'describe-db-subnet-groups']).DBSubnetGroups.map((g) => g.DBSubnetGroupName),
  ].filter((n) => n.startsWith(project))],
];

// 残ってよいもの(ほぼ無料。次の作成で使う)。情報として表示する
const kept = [
  ['ECR(イメージの置き場)', () => aws(['ecr', 'describe-repositories']).repositories.filter((r) => r.repositoryName.startsWith(project)).map((r) => r.repositoryName)],
  ['S3(Terraform の state)', () => aws(['s3api', 'list-buckets']).Buckets.map((b) => b.Name).filter((n) => n.startsWith(`${project}-tfstate`))],
  ['VPC(ネットワーク)', () => aws(['ec2', 'describe-vpcs', ...filters(tagFilter)]).Vpcs.map((v) => v.VpcId)],
];

let remaining = 0;
console.log(`リージョン: ${region}\n`);
console.log('--- 課金されるもの(残っていてはいけない) ---');
for (const [label, check] of billable) {
  let found;
  try {
    found = check();
  } catch (e) {
    console.log(`?  ${label}: 確認に失敗しました (${String(e.stderr || e.message).split('\n')[0]})`);
    remaining++;
    continue;
  }
  if (found.length === 0) {
    console.log(`OK ${label}`);
  } else {
    remaining += found.length;
    console.log(`NG ${label}: ${found.join(', ')}`);
  }
}

console.log('\n--- 残ってよいもの(ほぼ無料) ---');
for (const [label, check] of kept) {
  try {
    const found = check();
    console.log(`   ${label}: ${found.length ? found.join(', ') : 'なし'}`);
  } catch (e) {
    console.log(`   ${label}: 確認に失敗しました (${String(e.stderr || e.message).split('\n')[0]})`);
  }
}

console.log(remaining === 0 ? '\n結果: 課金されるものは残っていません。' : `\n結果: 残っているもの、または確認できなかったものが ${remaining} 件あります。`);
process.exit(remaining === 0 ? 0 : 1);

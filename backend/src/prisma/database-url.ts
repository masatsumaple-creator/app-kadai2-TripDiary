// DB への接続先(mysql:// 形式の URL)を決める。
//
// - DATABASE_URL があれば、それをそのまま使う(ローカル開発・テスト・CI)
// - なければ、DB_HOST・DB_PORT・DB_NAME・DB_USER・DB_PASSWORD から組み立てる(AWS の ECS)。
//   ECS は、Secrets Manager の値を、ユーザー名とパスワードを別々の環境変数として渡す。
//   RDS が作るパスワードには、URL に使えない記号(@ : / ? # など)が含まれうるため、URL エンコードする
//
// Prisma CLI の設定(prisma.config.ts)も、この関数を使う(マイグレーションのタスクでも同じ環境変数で動かすため)。
export function resolveDatabaseUrl(
  env: Record<string, string | undefined> = process.env,
): string {
  const direct = env['DATABASE_URL'];
  if (direct) {
    return direct;
  }

  const missing = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'].filter(
    (key) => !env[key],
  );
  if (missing.length > 0) {
    throw new Error(
      `DATABASE_URL is not set, and ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not set`,
    );
  }

  const user = encodeURIComponent(env['DB_USER']!);
  const password = encodeURIComponent(env['DB_PASSWORD']!);
  const port = env['DB_PORT'] || '3306';
  return `mysql://${user}:${password}@${env['DB_HOST']}:${port}/${encodeURIComponent(env['DB_NAME']!)}`;
}

import { readFileSync } from 'node:fs';

// DB への通信の暗号化(TLS)。環境変数 DB_SSL_CA_FILE に、サーバーの証明書を発行した認証局(CA)の
// 証明書ファイルを指定すると、TLS で接続し、**サーバーの証明書を、その CA で検証する**(なりすまし防止)。
// AWS(RDS)では、RDS の公式の CA の証明書(backend/certs/rds-global-bundle.pem)を指定する。
// 指定がなければ、TLS なし(ローカルの開発・テスト)。
export interface DatabaseSsl {
  ca: string;
  rejectUnauthorized: true;
}

export function resolveDatabaseSsl(
  env: Record<string, string | undefined> = process.env,
): DatabaseSsl | undefined {
  const file = env['DB_SSL_CA_FILE'];
  if (!file) return undefined;
  let ca: string;
  try {
    ca = readFileSync(file, 'utf8');
  } catch {
    throw new Error(`DB_SSL_CA_FILE を読み込めません: ${file}`);
  }
  if (!ca.includes('BEGIN CERTIFICATE')) {
    throw new Error(
      `DB_SSL_CA_FILE が、証明書のファイルではありません: ${file}`,
    );
  }
  return { ca, rejectUnauthorized: true };
}

// Prisma CLI(マイグレーション)にも、同じ TLS の指定を渡すため、接続の URL に付ける(sslaccept=strict は、証明書を検証する)。
// すでに ssl の指定がある URL には、何も足さない
export function withSslParams(
  url: string,
  env: Record<string, string | undefined> = process.env,
): string {
  const file = env['DB_SSL_CA_FILE'];
  if (!file || /[?&]ssl(accept|cert)=/.test(url)) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}sslaccept=strict&sslcert=${encodeURIComponent(file)}`;
}

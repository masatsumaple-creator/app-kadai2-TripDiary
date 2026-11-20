import { X509Certificate } from 'node:crypto';
import { resolveDatabaseSsl, withSslParams } from './database-ssl.js';

const BUNDLE = 'certs/rds-global-bundle.pem';

describe('resolveDatabaseSsl', () => {
  it('DB_SSL_CA_FILE がなければ、TLS なし(ローカルの開発・テスト)', () => {
    expect(resolveDatabaseSsl({})).toBeUndefined();
    expect(resolveDatabaseSsl({ DB_SSL_CA_FILE: '' })).toBeUndefined();
  });

  it('指定があれば、その CA で、サーバーの証明書を検証する(rejectUnauthorized)', () => {
    const ssl = resolveDatabaseSsl({ DB_SSL_CA_FILE: BUNDLE });
    expect(ssl?.rejectUnauthorized).toBe(true);
    expect(ssl?.ca).toContain('BEGIN CERTIFICATE');
  });

  it('RDS の公式の CA の証明書(東京リージョンのものを含む)が、リポジトリにあり、期限が切れていない', () => {
    const ca = resolveDatabaseSsl({ DB_SSL_CA_FILE: BUNDLE })!.ca;
    const certs = ca.match(
      /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g,
    )!;
    expect(certs.length).toBeGreaterThan(10);
    const parsed = certs.map((pem) => new X509Certificate(pem));
    expect(parsed.some((c) => c.subject.includes('ap-northeast-1'))).toBe(true);
    // 期限が近づいたら、証明書の更新が必要になる(最新: https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem)
    const tokyo = parsed.filter((c) => c.subject.includes('ap-northeast-1'));
    for (const c of tokyo)
      expect(new Date(c.validTo).getTime()).toBeGreaterThan(Date.now());
  });

  it('ファイルがない・証明書でないときは、設定の誤りとして、すぐに例外にする(TLS なしで、黙って接続しない)', () => {
    expect(() =>
      resolveDatabaseSsl({ DB_SSL_CA_FILE: 'certs/missing.pem' }),
    ).toThrow(/DB_SSL_CA_FILE を読み込めません/);
    expect(() =>
      resolveDatabaseSsl({ DB_SSL_CA_FILE: 'package.json' }),
    ).toThrow(/証明書のファイルではありません/);
  });
});

describe('withSslParams(Prisma CLI にも、同じ TLS の指定を渡す)', () => {
  const url = 'mysql://u:p@h:3306/d';

  it('DB_SSL_CA_FILE があれば、証明書を検証する指定(sslaccept=strict と sslcert)を付ける', () => {
    expect(
      withSslParams(url, {
        DB_SSL_CA_FILE: '/app/certs/rds-global-bundle.pem',
      }),
    ).toBe(
      `${url}?sslaccept=strict&sslcert=${encodeURIComponent('/app/certs/rds-global-bundle.pem')}`,
    );
  });

  it('すでにクエリがあれば & でつなぐ。ssl の指定がすでにあれば、何も足さない', () => {
    expect(
      withSslParams(`${url}?connection_limit=5`, { DB_SSL_CA_FILE: '/c.pem' }),
    ).toBe(
      `${url}?connection_limit=5&sslaccept=strict&sslcert=${encodeURIComponent('/c.pem')}`,
    );
    const own = `${url}?sslaccept=accept_invalid_certs`;
    expect(withSslParams(own, { DB_SSL_CA_FILE: '/c.pem' })).toBe(own);
  });

  it('DB_SSL_CA_FILE がなければ、そのまま', () => {
    expect(withSslParams(url, {})).toBe(url);
  });
});

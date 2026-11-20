import { resolveDatabaseUrl } from './database-url.js';

describe('resolveDatabaseUrl', () => {
  it('DATABASE_URL があれば、そのまま使う(DB_* より優先)', () => {
    expect(
      resolveDatabaseUrl({
        DATABASE_URL: 'mysql://a:b@h:1/d',
        DB_HOST: 'other',
        DB_NAME: 'x',
        DB_USER: 'x',
        DB_PASSWORD: 'x',
      }),
    ).toBe('mysql://a:b@h:1/d');
  });

  it('DB_* から組み立てる。ポートの既定は 3306', () => {
    expect(
      resolveDatabaseUrl({
        DB_HOST: 'db.example',
        DB_NAME: 'tripdiary',
        DB_USER: 'admin',
        DB_PASSWORD: 'pw',
      }),
    ).toBe('mysql://admin:pw@db.example:3306/tripdiary');
    expect(
      resolveDatabaseUrl({
        DB_HOST: 'db.example',
        DB_PORT: '3307',
        DB_NAME: 'tripdiary',
        DB_USER: 'admin',
        DB_PASSWORD: 'pw',
      }),
    ).toBe('mysql://admin:pw@db.example:3307/tripdiary');
  });

  it('パスワードの記号を URL エンコードし、URL として解釈し直すと元の値に戻る', () => {
    const password = 'p@ss:w/ord?#%&=+ 日本';
    const url = new URL(
      resolveDatabaseUrl({
        DB_HOST: 'h',
        DB_NAME: 'd',
        DB_USER: 'u@x',
        DB_PASSWORD: password,
      }),
    );
    expect(url.hostname).toBe('h');
    expect(url.pathname).toBe('/d');
    expect(decodeURIComponent(url.username)).toBe('u@x');
    expect(decodeURIComponent(url.password)).toBe(password);
  });

  it('足りない値を名前つきで知らせる', () => {
    expect(() => resolveDatabaseUrl({ DB_HOST: 'h' })).toThrow(
      /DB_NAME, DB_USER, DB_PASSWORD are not set/,
    );
    expect(() => resolveDatabaseUrl({})).toThrow(/DATABASE_URL is not set/);
  });
});

describe('resolveDatabaseUrl(TLS)', () => {
  const base = { DB_HOST: 'h', DB_NAME: 'd', DB_USER: 'u', DB_PASSWORD: 'p' };

  it('DB_SSL_CA_FILE があれば、組み立てた URL に、TLS の指定が付く', () => {
    expect(resolveDatabaseUrl({ ...base, DB_SSL_CA_FILE: '/ca.pem' })).toBe(
      `mysql://u:p@h:3306/d?sslaccept=strict&sslcert=${encodeURIComponent('/ca.pem')}`,
    );
  });

  it('DATABASE_URL を直接指定した場合も、TLS の指定が付く', () => {
    expect(
      resolveDatabaseUrl({
        DATABASE_URL: 'mysql://a:b@h:1/d',
        DB_SSL_CA_FILE: '/ca.pem',
      }),
    ).toContain('sslaccept=strict');
  });

  it('DB_SSL_CA_FILE がなければ、TLS の指定は付かない', () => {
    expect(resolveDatabaseUrl(base)).toBe('mysql://u:p@h:3306/d');
  });
});

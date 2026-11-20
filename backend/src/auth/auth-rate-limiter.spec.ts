import { ApiError } from '../common/api-error.js';
import {
  AuthRateLimiter,
  DEFAULT_RATE_LIMITS,
  rateLimitOptionsFromEnv,
} from './auth-rate-limiter.js';

// 時計を、テストから進められるようにする
const setup = (overrides: Partial<typeof DEFAULT_RATE_LIMITS> = {}) => {
  let now = 1_000_000;
  const limiter = new AuthRateLimiter({
    ...DEFAULT_RATE_LIMITS,
    ...overrides,
    now: () => now,
  });
  return {
    limiter,
    advance: (ms: number) => {
      now += ms;
    },
  };
};

const catchError = (fn: () => void): ApiError | undefined => {
  try {
    fn();
  } catch (e) {
    return e as ApiError;
  }
  return undefined;
};

const fail = (
  limiter: AuthRateLimiter,
  n: number,
  email = 'a@example.com',
  ip = '1.1.1.1',
) => {
  for (let i = 0; i < n; i++) limiter.recordLoginFailure(ip, email);
};

describe('AuthRateLimiter: ログイン', () => {
  it('メールアドレスごとに、失敗が 10 回に達するまでは通し、達したら 429(Retry-After つき)', () => {
    const { limiter } = setup();
    fail(limiter, 9);
    expect(
      catchError(() => limiter.assertLoginAllowed('1.1.1.1', 'a@example.com')),
    ).toBeUndefined();

    fail(limiter, 1);
    const e = catchError(() =>
      limiter.assertLoginAllowed('1.1.1.1', 'a@example.com'),
    );
    expect(e?.getStatus()).toBe(429);
    expect((e!.getResponse() as { code: string }).code).toBe(
      'TOO_MANY_REQUESTS',
    );
    // 窓(15 分)の残り
    expect(e?.retryAfterSeconds).toBe(15 * 60);
  });

  it('ほかのメールアドレスには、影響しない(IP の上限までは)', () => {
    const { limiter } = setup();
    fail(limiter, 10, 'a@example.com');
    expect(
      catchError(() => limiter.assertLoginAllowed('1.1.1.1', 'b@example.com')),
    ).toBeUndefined();
  });

  it('時間がたつと、制限が解ける(窓は、最初の失敗から 15 分)。Retry-After は、残りの秒数', () => {
    const { limiter, advance } = setup();
    fail(limiter, 10);
    advance(10 * 60 * 1000);
    expect(
      catchError(() => limiter.assertLoginAllowed('1.1.1.1', 'a@example.com'))
        ?.retryAfterSeconds,
    ).toBe(5 * 60);
    advance(5 * 60 * 1000);
    expect(
      catchError(() => limiter.assertLoginAllowed('1.1.1.1', 'a@example.com')),
    ).toBeUndefined();
    // 解けたあとは、また 0 から数える
    fail(limiter, 9);
    expect(
      catchError(() => limiter.assertLoginAllowed('1.1.1.1', 'a@example.com')),
    ).toBeUndefined();
  });

  it('ログインに成功すると、そのメールアドレスの失敗の回数は 0 に戻る(IP の回数は、そのまま)', () => {
    const { limiter } = setup({ loginFailuresPerIp: 12 });
    fail(limiter, 9);
    limiter.recordLoginSuccess('a@example.com');
    fail(limiter, 9);
    expect(
      catchError(() => limiter.assertLoginAllowed('1.1.1.1', 'a@example.com')),
    ).toBeDefined(); // IP は 18 回(上限 12)。メールの回数は戻っている
    expect(
      catchError(() => limiter.assertLoginAllowed('2.2.2.2', 'a@example.com')),
    ).toBeUndefined(); // 別の IP からなら、メールの回数は 9 回
  });

  it('IP ごとの上限(既定 50 回)は、メールアドレスが違っても、数える', () => {
    const { limiter } = setup();
    for (let i = 0; i < 49; i++)
      limiter.recordLoginFailure('9.9.9.9', `user${i}@example.com`);
    expect(
      catchError(() =>
        limiter.assertLoginAllowed('9.9.9.9', 'new@example.com'),
      ),
    ).toBeUndefined();
    limiter.recordLoginFailure('9.9.9.9', 'user49@example.com');
    expect(
      catchError(() =>
        limiter.assertLoginAllowed('9.9.9.9', 'new@example.com'),
      )?.getStatus(),
    ).toBe(429);
    // 別の IP は、影響を受けない
    expect(
      catchError(() =>
        limiter.assertLoginAllowed('8.8.8.8', 'new@example.com'),
      ),
    ).toBeUndefined();
  });

  it('メールアドレスは、大文字・小文字・前後の空白を区別せず、同じものとして数える', () => {
    const { limiter } = setup();
    fail(limiter, 5, 'A@Example.com');
    fail(limiter, 5, '  a@example.COM ');
    expect(
      catchError(() =>
        limiter.assertLoginAllowed('1.1.1.1', 'a@example.com'),
      )?.getStatus(),
    ).toBe(429);
  });

  it('上限は、設定で変えられる。0 なら、制限しない', () => {
    const small = setup({ loginFailuresPerEmail: 2 });
    fail(small.limiter, 2);
    expect(
      catchError(() =>
        small.limiter.assertLoginAllowed('1.1.1.1', 'a@example.com'),
      )?.getStatus(),
    ).toBe(429);

    const off = setup({ loginFailuresPerEmail: 0, loginFailuresPerIp: 0 });
    fail(off.limiter, 500);
    expect(
      catchError(() =>
        off.limiter.assertLoginAllowed('1.1.1.1', 'a@example.com'),
      ),
    ).toBeUndefined();
  });
});

describe('AuthRateLimiter: 登録', () => {
  it('既定は、制限しない', () => {
    const { limiter } = setup();
    for (let i = 0; i < 200; i++) limiter.assertRegisterAllowed('1.1.1.1');
  });

  it('上限(IP ごとに 1 時間あたり)を指定すると、超えたら 429。1 時間たつと解ける', () => {
    const { limiter, advance } = setup({ registerPerIpPerHour: 3 });
    for (let i = 0; i < 3; i++) limiter.assertRegisterAllowed('1.1.1.1');
    const e = catchError(() => limiter.assertRegisterAllowed('1.1.1.1'));
    expect(e?.getStatus()).toBe(429);
    expect(e?.retryAfterSeconds).toBe(60 * 60);
    // 別の IP は、影響を受けない
    expect(
      catchError(() => limiter.assertRegisterAllowed('2.2.2.2')),
    ).toBeUndefined();

    advance(60 * 60 * 1000);
    expect(
      catchError(() => limiter.assertRegisterAllowed('1.1.1.1')),
    ).toBeUndefined();
  });
});

describe('rateLimitOptionsFromEnv', () => {
  it('指定がなければ、既定', () => {
    expect(rateLimitOptionsFromEnv({})).toEqual(DEFAULT_RATE_LIMITS);
  });

  it('環境変数で、上限・窓(秒)を指定できる', () => {
    expect(
      rateLimitOptionsFromEnv({
        LOGIN_FAILURE_LIMIT_PER_EMAIL: '5',
        LOGIN_FAILURE_LIMIT_PER_IP: '20',
        LOGIN_FAILURE_WINDOW_SECONDS: '60',
        REGISTER_LIMIT_PER_IP_PER_HOUR: '30',
      }),
    ).toEqual({
      loginFailuresPerEmail: 5,
      loginFailuresPerIp: 20,
      loginWindowMs: 60_000,
      registerPerIpPerHour: 30,
    });
  });

  it('数値でない・負の値・小数は、既定に戻す(設定の誤りで、制限が外れないように)', () => {
    for (const bad of ['abc', '-1', '1.5', 'NaN']) {
      expect(
        rateLimitOptionsFromEnv({ LOGIN_FAILURE_LIMIT_PER_EMAIL: bad })
          .loginFailuresPerEmail,
      ).toBe(DEFAULT_RATE_LIMITS.loginFailuresPerEmail);
    }
    expect(
      rateLimitOptionsFromEnv({ LOGIN_FAILURE_LIMIT_PER_EMAIL: '' })
        .loginFailuresPerEmail,
    ).toBe(10);
  });
});

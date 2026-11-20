import { ApiError } from '../common/api-error.js';

// ログイン・登録の、回数の制限(総当たりの攻撃への備え)。
//
// - ログイン: **失敗**の回数を、メールアドレスごと(アカウントを守る)と、接続元の IP ごとで数える。
//   既定: メールアドレスごとに 15 分間で 10 回、IP ごとに 15 分間で 50 回まで。超えたら 429。
//   成功したら、そのメールアドレスの失敗の回数は、0 に戻る。
//   正しいパスワードでも、制限中は 429 になる(攻撃者が、制限中に当てても、判別できないように)。
//   メールアドレスが未登録でも、同じように数える(アカウントの有無を知らせない)
// - 登録: IP ごとに 1 時間あたりの回数(既定は 0 = 制限しない。AWS では、環境変数で指定する)
//
// 状態は、このプロセスのメモリの中にだけある(再起動すると、数え直し)。タスクが複数あるときは、タスクごとに数える。
// この課題の構成(タスク 1 つ)では十分。複数にするときは、共有の保存先(Redis など)が要る。
export interface RateLimitOptions {
  loginFailuresPerEmail: number;
  loginFailuresPerIp: number;
  loginWindowMs: number;
  registerPerIpPerHour: number; // 0 = 制限しない
  // テストで、時計を差し替えるため
  now?: () => number;
}

export const DEFAULT_RATE_LIMITS: RateLimitOptions = {
  loginFailuresPerEmail: 10,
  loginFailuresPerIp: 50,
  loginWindowMs: 15 * 60 * 1000,
  registerPerIpPerHour: 0,
};

const HOUR_MS = 60 * 60 * 1000;
const PRUNE_THRESHOLD = 5000;

const toInt = (v: string | undefined, fallback: number): number => {
  if (v === undefined || v.trim() === '') return fallback;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
};

// 環境変数で、上限を変えられる(指定がなければ、既定)
export function rateLimitOptionsFromEnv(
  env: Record<string, string | undefined> = process.env,
): RateLimitOptions {
  const d = DEFAULT_RATE_LIMITS;
  return {
    loginFailuresPerEmail: toInt(
      env['LOGIN_FAILURE_LIMIT_PER_EMAIL'],
      d.loginFailuresPerEmail,
    ),
    loginFailuresPerIp: toInt(
      env['LOGIN_FAILURE_LIMIT_PER_IP'],
      d.loginFailuresPerIp,
    ),
    loginWindowMs:
      toInt(env['LOGIN_FAILURE_WINDOW_SECONDS'], d.loginWindowMs / 1000) * 1000,
    registerPerIpPerHour: toInt(
      env['REGISTER_LIMIT_PER_IP_PER_HOUR'],
      d.registerPerIpPerHour,
    ),
  };
}

interface Counter {
  count: number;
  resetAt: number;
}

export class AuthRateLimiter {
  private readonly counters = new Map<string, Counter>();

  constructor(private readonly options: RateLimitOptions) {}

  private now(): number {
    return (this.options.now ?? Date.now)();
  }

  // 期限内の、その鍵の回数(なければ undefined)
  private active(key: string): Counter | undefined {
    const c = this.counters.get(key);
    if (c && c.resetAt <= this.now()) {
      this.counters.delete(key);
      return undefined;
    }
    return c;
  }

  private increment(key: string, windowMs: number): void {
    const c = this.active(key);
    if (c) {
      c.count++;
      return;
    }
    if (this.counters.size >= PRUNE_THRESHOLD) this.prune();
    this.counters.set(key, { count: 1, resetAt: this.now() + windowMs });
  }

  // 期限の切れたものを捨てる(メモリが増え続けないように)
  private prune(): void {
    const now = this.now();
    for (const [k, c] of this.counters)
      if (c.resetAt <= now) this.counters.delete(k);
  }

  private tooMany(
    key: string,
    limit: number,
  ): { retryAfterSeconds: number } | null {
    if (limit <= 0) return null;
    const c = this.active(key);
    if (!c || c.count < limit) return null;
    return { retryAfterSeconds: Math.ceil((c.resetAt - this.now()) / 1000) };
  }

  private static email(email: string): string {
    return email.trim().toLowerCase();
  }

  // ログインの前に呼ぶ。失敗が上限に達していれば、429
  assertLoginAllowed(ip: string, email: string): void {
    const blocked = [
      this.tooMany(
        `login:email:${AuthRateLimiter.email(email)}`,
        this.options.loginFailuresPerEmail,
      ),
      this.tooMany(`login:ip:${ip}`, this.options.loginFailuresPerIp),
    ].filter((b): b is { retryAfterSeconds: number } => b !== null);
    if (blocked.length === 0) return;
    throw new ApiError(
      429,
      'TOO_MANY_REQUESTS',
      'ログインの失敗が続いたため、しばらくしてからやり直してください。',
      undefined,
      Math.max(...blocked.map((b) => b.retryAfterSeconds)),
    );
  }

  recordLoginFailure(ip: string, email: string): void {
    this.increment(
      `login:email:${AuthRateLimiter.email(email)}`,
      this.options.loginWindowMs,
    );
    this.increment(`login:ip:${ip}`, this.options.loginWindowMs);
  }

  // ログインできたら、そのメールアドレスの失敗の回数を、0 に戻す(IP の回数は、そのまま)
  recordLoginSuccess(email: string): void {
    this.counters.delete(`login:email:${AuthRateLimiter.email(email)}`);
  }

  // 登録の前に呼ぶ。この呼び出しを 1 回と数え、上限を超えたら 429
  assertRegisterAllowed(ip: string): void {
    const limit = this.options.registerPerIpPerHour;
    if (limit <= 0) return;
    const key = `register:ip:${ip}`;
    const blocked = this.tooMany(key, limit);
    if (blocked) {
      throw new ApiError(
        429,
        'TOO_MANY_REQUESTS',
        '登録の回数が多すぎます。しばらくしてからやり直してください。',
        undefined,
        blocked.retryAfterSeconds,
      );
    }
    this.increment(key, HOUR_MS);
  }
}

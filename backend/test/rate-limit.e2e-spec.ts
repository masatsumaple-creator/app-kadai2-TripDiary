import 'dotenv/config';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import {
  AuthRateLimiter,
  DEFAULT_RATE_LIMITS,
} from './../src/auth/auth-rate-limiter.js';
import type { RateLimitOptions } from './../src/auth/auth-rate-limiter.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { retryOnWriteConflict } from './../src/prisma/retry.js';

// ログイン・登録の回数の制限(総当たりへの備え)の結合テスト。
// 起動中の MySQL(docker compose up -d db)、DATABASE_URL、JWT_SECRET が必要
describe('Rate limit (e2e)', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const PREFIX = 'e2e-ratelimit-';
  const PASSWORD = 'password-1234';
  let prisma: PrismaService;
  const apps: INestApplication<App>[] = [];

  // 制限の設定を指定して、アプリを作る(環境変数 TRUST_PROXY も、指定できる)
  const createApp = async (
    limits?: Partial<RateLimitOptions>,
    trustProxy?: string,
  ): Promise<INestApplication<App>> => {
    const saved = process.env['TRUST_PROXY'];
    if (trustProxy === undefined) delete process.env['TRUST_PROXY'];
    else process.env['TRUST_PROXY'] = trustProxy;
    try {
      let builder = Test.createTestingModule({ imports: [AppModule] });
      if (limits) {
        builder = builder
          .overrideProvider(AuthRateLimiter)
          .useValue(new AuthRateLimiter({ ...DEFAULT_RATE_LIMITS, ...limits }));
      }
      const moduleRef = await builder.compile();
      const app = moduleRef.createNestApplication<INestApplication<App>>();
      configureApp(app);
      await app.init();
      apps.push(app);
      prisma = app.get(PrismaService);
      return app;
    } finally {
      if (saved === undefined) delete process.env['TRUST_PROXY'];
      else process.env['TRUST_PROXY'] = saved;
    }
  };

  let sequence = 0;
  const email = (label: string) =>
    `${PREFIX}${label}-${++sequence}-${suffix}@example.com`;

  const register = (
    app: INestApplication<App>,
    address: string,
    ip?: string,
  ) => {
    const r = request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ name: 'user', email: address, password: PASSWORD });
    return ip ? r.set('X-Forwarded-For', ip) : r;
  };
  const login = (
    app: INestApplication<App>,
    address: string,
    password: string,
    ip?: string,
  ) => {
    const r = request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: address, password });
    return ip ? r.set('X-Forwarded-For', ip) : r;
  };

  afterAll(async () => {
    await retryOnWriteConflict(() =>
      prisma.user.deleteMany({
        where: {
          AND: [
            { email: { startsWith: PREFIX } },
            { email: { endsWith: `-${suffix}@example.com` } },
          ],
        },
      }),
    );
    for (const app of apps) await app.close();
  });

  describe('ログインの失敗(既定: メールアドレスごとに 10 回)', () => {
    it('失敗が 10 回続くと、11 回目は、正しいパスワードでも 429(Retry-After つき)。解けるまで、ログインできない', async () => {
      const app = await createApp();
      const user = email('lock');
      await register(app, user).expect(201);

      for (let i = 0; i < 10; i++) {
        await login(app, user, 'wrong-password').expect(401);
      }
      const locked = await login(app, user, PASSWORD).expect(429);
      expect(locked.body.code).toBe('TOO_MANY_REQUESTS');
      expect(locked.body.message).toContain('しばらくしてから');
      expect(Number(locked.headers['retry-after'])).toBeGreaterThan(0);
      expect(Number(locked.headers['retry-after'])).toBeLessThanOrEqual(
        15 * 60,
      );
      // 制限中は、何度やっても 429
      await login(app, user, PASSWORD).expect(429);
    });

    it('未登録のメールアドレスにも、同じように制限がかかる(アカウントの有無を知らせない)', async () => {
      const app = await createApp();
      const ghost = email('ghost');
      for (let i = 0; i < 10; i++) {
        await login(app, ghost, 'whatever').expect(401);
      }
      const res = await login(app, ghost, 'whatever').expect(429);
      expect(res.body.code).toBe('TOO_MANY_REQUESTS');
    });

    it('ほかのメールアドレスには、影響しない', async () => {
      const app = await createApp();
      const victim = email('victim');
      const other = email('other');
      await register(app, victim).expect(201);
      await register(app, other).expect(201);

      for (let i = 0; i < 10; i++) {
        await login(app, victim, 'wrong').expect(401);
      }
      await login(app, victim, PASSWORD).expect(429);
      await login(app, other, PASSWORD).expect(200);
    });

    it('ログインに成功すると、失敗の回数は 0 に戻る', async () => {
      const app = await createApp();
      const user = email('reset');
      await register(app, user).expect(201);

      for (let i = 0; i < 9; i++) {
        await login(app, user, 'wrong').expect(401);
      }
      await login(app, user, PASSWORD).expect(200); // 9 回失敗のあとの成功
      // 戻っているので、また 9 回まで失敗できる(10 回目で、制限に達する)
      for (let i = 0; i < 9; i++) {
        await login(app, user, 'wrong').expect(401);
      }
      await login(app, user, PASSWORD).expect(200);
    });

    it('入力の誤り(400)は、失敗として数えない', async () => {
      const app = await createApp();
      const user = email('validation');
      await register(app, user).expect(201);
      for (let i = 0; i < 15; i++) {
        await request(app.getHttpServer())
          .post('/api/auth/login')
          .send({ email: 'not-an-email', password: '' })
          .expect(400);
      }
      await login(app, user, PASSWORD).expect(200);
    });
  });

  describe('IP ごとの制限', () => {
    it('メールアドレスが違っても、同じ IP からの失敗を数え、上限を超えると 429', async () => {
      const app = await createApp({ loginFailuresPerIp: 3 });
      const user = email('ipuser');
      await register(app, user).expect(201);

      for (let i = 0; i < 3; i++) {
        await login(app, email(`guess${i}`), 'wrong').expect(401);
      }
      // 別のメールアドレス・正しいパスワードでも、同じ IP は 429
      await login(app, user, PASSWORD).expect(429);
    });
  });

  describe('プロキシの後ろの IP(環境変数 TRUST_PROXY)', () => {
    it('TRUST_PROXY=1 なら、X-Forwarded-For の、信頼するプロキシの 1 つ手前の IP を、接続元として数える', async () => {
      const app = await createApp({ loginFailuresPerIp: 3 }, '1');
      const user = email('proxy');
      await register(app, user).expect(201);

      for (let i = 0; i < 3; i++) {
        await login(app, email(`p${i}`), 'wrong', '10.0.0.1').expect(401);
      }
      // 同じ IP(10.0.0.1)は、制限される
      await login(app, user, PASSWORD, '10.0.0.1').expect(429);
      // 別の IP(10.0.0.2)は、制限されない
      await login(app, user, PASSWORD, '10.0.0.2').expect(200);
    });

    it('利用者が、X-Forwarded-For の左側に偽の IP を足しても、信頼するプロキシが足した IP(右側)で数える(なりすまし・回避の防止)', async () => {
      const app = await createApp({ loginFailuresPerIp: 3 }, '1');
      const user = email('spoof');
      await register(app, user).expect(201);

      // 実際の接続元は 10.0.0.1。毎回、違う偽の IP を左に付けて、制限を逃れようとする
      for (let i = 0; i < 3; i++) {
        await login(
          app,
          email(`s${i}`),
          'wrong',
          `203.0.113.${i}, 10.0.0.1`,
        ).expect(401);
      }
      await login(app, user, PASSWORD, '203.0.113.99, 10.0.0.1').expect(429);
    });

    it('TRUST_PROXY がなければ、X-Forwarded-For は無視する(直接の接続元で数える)', async () => {
      const app = await createApp({ loginFailuresPerIp: 3 });
      const user = email('noproxy');
      await register(app, user).expect(201);

      // 毎回、違う X-Forwarded-For を付けても、同じ接続元として数える
      for (let i = 0; i < 3; i++) {
        await login(app, email(`n${i}`), 'wrong', `10.1.0.${i}`).expect(401);
      }
      await login(app, user, PASSWORD, '10.9.9.9').expect(429);
    });
  });

  describe('登録', () => {
    it('既定では、制限しない', async () => {
      const app = await createApp();
      for (let i = 0; i < 12; i++) {
        await register(app, email(`free${i}`)).expect(201);
      }
    });

    it('上限(IP ごとに 1 時間あたり)を指定すると、超えた分は 429(Retry-After つき)', async () => {
      const app = await createApp({ registerPerIpPerHour: 2 });
      await register(app, email('r1')).expect(201);
      await register(app, email('r2')).expect(201);
      const res = await register(app, email('r3')).expect(429);
      expect(res.body.code).toBe('TOO_MANY_REQUESTS');
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    });
  });
});

import 'dotenv/config';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { retryOnWriteConflict } from './../src/prisma/retry.js';

// 起動中の MySQL(docker compose up -d db)と DATABASE_URL、JWT_SECRET が必要
describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const emailOf = (label: string) => `e2e-auth-${label}-${suffix}@example.com`;
  const password = 'password-1234';

  const refreshCookie = (res: request.Response): string | undefined =>
    (res.headers['set-cookie'] as unknown as string[] | undefined)?.find((c) =>
      c.startsWith('refresh_token='),
    );
  const cookieValue = (setCookie: string) => setCookie.split(';')[0]!;

  const register = (label: string) =>
    request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ name: 'テスト', email: emailOf(label), password });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await retryOnWriteConflict(() =>
      prisma.user.deleteMany({
        // ファイルごとに異なる接頭辞で、範囲を狭くして削除する。
        // 全ユーザーを走査する条件だと、並列に動く他のテストファイルの書き込みと、ロックが競合してデッドロックになる
        where: {
          AND: [
            { email: { startsWith: 'e2e-auth-' } },
            { email: { endsWith: `-${suffix}@example.com` } },
          ],
        },
      }),
    );
    await app.close();
  });

  describe('POST /api/auth/register', () => {
    it('登録するとアクセストークンと HttpOnly の Cookie を返す', async () => {
      const res = await register('new').expect(201);
      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.user).toEqual({
        id: expect.any(Number),
        name: 'テスト',
        email: emailOf('new'),
      });
      expect(res.body.user.passwordHash).toBeUndefined();
      const cookie = refreshCookie(res)!;
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Strict');
      expect(cookie).toContain('Path=/api/auth');
    });

    it('パスワードとリフレッシュトークンは平文で保存しない', async () => {
      const res = await register('hash').expect(201);
      const user = await prisma.user.findUniqueOrThrow({
        where: { email: emailOf('hash') },
      });
      expect(user.passwordHash).not.toContain(password);
      const raw = cookieValue(refreshCookie(res)!).split('=')[1]!;
      const tokens = await prisma.refreshToken.findMany({
        where: { userId: user.id },
      });
      expect(tokens).toHaveLength(1);
      expect(tokens[0]!.tokenHash).not.toBe(raw);
    });

    it('同じメールアドレスは 409', async () => {
      await register('dup').expect(201);
      const res = await register('dup').expect(409);
      expect(res.body.code).toBe('EMAIL_ALREADY_REGISTERED');
    });

    it('入力が不正なら 400 と項目ごとのエラーを返す', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ name: '', email: 'not-an-email', password: 'short' })
        .expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(Object.keys(res.body.fieldErrors).sort()).toEqual([
        'email',
        'name',
        'password',
      ]);
    });

    it('想定外の項目は拒否する', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ name: 'a', email: emailOf('extra'), password, isAdmin: true })
        .expect(400);
    });
  });

  describe('POST /api/auth/login', () => {
    it('正しい資格情報でログインできる(メールの大文字小文字は区別しない)', async () => {
      await register('login').expect(201);
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: emailOf('login').toUpperCase(), password })
        .expect(200);
      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(refreshCookie(res)).toBeDefined();
    });

    it('パスワード違いと未登録メールは同じ 401', async () => {
      await register('bad').expect(201);
      const wrongPassword = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: emailOf('bad'), password: 'wrong-password' })
        .expect(401);
      const unknown = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: emailOf('nobody'), password })
        .expect(401);
      expect(wrongPassword.body).toEqual(unknown.body);
      expect(wrongPassword.body.code).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('GET /api/auth/me', () => {
    it('アクセストークンがあれば自分の情報を返す', async () => {
      const reg = await register('me').expect(201);
      const res = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${reg.body.accessToken}`)
        .expect(200);
      expect(res.body.email).toBe(emailOf('me'));
    });

    it('トークンなし・不正なトークンは 401', async () => {
      await request(app.getHttpServer()).get('/api/auth/me').expect(401);
      const res = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid.token.value')
        .expect(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('新しいアクセストークンを返し、リフレッシュトークンをローテーションする', async () => {
      const reg = await register('rot').expect(201);
      const oldCookie = cookieValue(refreshCookie(reg)!);

      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', oldCookie)
        .expect(200);
      const newCookie = cookieValue(refreshCookie(res)!);
      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(newCookie).not.toBe(oldCookie);

      // 新しいトークンは使える
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', newCookie)
        .expect(200);
    });

    it('使用済みトークンの再利用は拒否し、そのユーザーの全トークンを失効させる', async () => {
      const reg = await register('reuse').expect(201);
      const first = cookieValue(refreshCookie(reg)!);
      const rotated = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', first)
        .expect(200);
      const second = cookieValue(refreshCookie(rotated)!);

      // 使用済みの first を再利用 → 拒否
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', first)
        .expect(401);
      // 盗用の可能性があるため、正規の second も使えなくなる
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', second)
        .expect(401);
    });

    it('Cookie なし・不明なトークンは 401', async () => {
      await request(app.getHttpServer()).post('/api/auth/refresh').expect(401);
      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', 'refresh_token=unknown')
        .expect(401);
      expect(res.body.code).toBe('INVALID_REFRESH_TOKEN');
    });

    it('期限切れのトークンは 401', async () => {
      const reg = await register('exp').expect(201);
      await prisma.refreshToken.updateMany({
        where: { user: { email: emailOf('exp') } },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', cookieValue(refreshCookie(reg)!))
        .expect(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('ログアウトするとリフレッシュトークンが使えなくなる', async () => {
      const reg = await register('out').expect(201);
      const cookie = cookieValue(refreshCookie(reg)!);
      const res = await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Cookie', cookie)
        .expect(204);
      expect(refreshCookie(res)).toContain('refresh_token=;');
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', cookie)
        .expect(401);
    });

    it('未ログインでも 204(冪等)', async () => {
      await request(app.getHttpServer()).post('/api/auth/logout').expect(204);
    });
  });
});

import 'dotenv/config';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { ReverseGeocoder } from './../src/geocode/reverse-geocoder.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { retryOnWriteConflict } from './../src/prisma/retry.js';

// 住所の取得(GET /api/geocode/reverse)の結合テスト。
// AWS には接続しない(ReverseGeocoder を偽物に差し替える)。AWS への問い合わせの中身は、単体テスト(reverse-geocoder.spec.ts)で確かめる。
// 起動中の MySQL(docker compose up -d db)、DATABASE_URL、JWT_SECRET が必要
describe('Geocode (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const PREFIX = 'e2e-geocode-';
  const reverse = vi.fn();
  let token: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ReverseGeocoder)
      .useValue({ reverse })
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        name: 'geocoder',
        email: `${PREFIX}user-${suffix}@example.com`,
        password: 'password-1234',
      })
      .expect(201);
    token = res.body.accessToken;
  });

  // 波括弧が必要: モック自体を返すと、vitest が、後片付けの関数として呼んでしまう
  beforeEach(() => {
    reverse.mockReset();
  });

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
    await app.close();
  });

  const get = (query: string, withToken = true) => {
    const r = request(app.getHttpServer()).get(`/api/geocode/reverse?${query}`);
    return withToken ? r.set('Authorization', `Bearer ${token}`) : r;
  };

  it('緯度・経度から住所を返す(緯度・経度を、そのまま数値で渡す)', async () => {
    reverse.mockResolvedValue('京都府京都市東山区清水1丁目294');
    const res = await get('lat=34.9949&lng=135.785').expect(200);
    expect(res.body).toEqual({ address: '京都府京都市東山区清水1丁目294' });
    expect(reverse).toHaveBeenCalledWith(34.9949, 135.785);
  });

  it('住所が見つからなければ、address は null(エラーにしない)', async () => {
    reverse.mockResolvedValue(null);
    const res = await get('lat=0&lng=0').expect(200);
    expect(res.body).toEqual({ address: null });
  });

  it('ログインが必要(外部のサービスを呼ぶため、未ログインには使わせない)。呼び出しもしない', async () => {
    await get('lat=1&lng=1', false).expect(401);
    expect(reverse).not.toHaveBeenCalled();
  });

  it('緯度・経度が不正なら 400。呼び出しもしない', async () => {
    for (const q of [
      '',
      'lat=1',
      'lng=1',
      'lat=abc&lng=1',
      'lat=91&lng=1',
      'lat=-91&lng=1',
      'lat=1&lng=181',
      'lat=1&lng=-181',
      'lat=&lng=',
    ]) {
      const res = await get(q).expect(400);
      expect(res.body.code, q).toBe('VALIDATION_ERROR');
    }
    expect(reverse).not.toHaveBeenCalled();
  });

  it('外部のサービスが失敗したら 502(利用者向けのメッセージ。内部のエラーは見せない)', async () => {
    reverse.mockImplementation(() =>
      Promise.reject(new Error('AccessDeniedException: secret detail')),
    );
    const res = await get('lat=1&lng=1').expect(502);
    expect(res.body.code).toBe('GEOCODE_UNAVAILABLE');
    expect(res.body.message).toContain('手入力');
    expect(JSON.stringify(res.body)).not.toContain('secret detail');
  });
});

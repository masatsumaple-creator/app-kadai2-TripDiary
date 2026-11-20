import 'dotenv/config';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { retryOnWriteConflict } from './../src/prisma/retry.js';

// 地図の表示範囲の API(GET /api/spots/map)の結合テスト。
// 起動中の MySQL(docker compose up -d db)、マイグレーション適用済みの DB、DATABASE_URL、JWT_SECRET が必要。
// ほかのテストの投稿と混ざらないよう、テストごとに、別の場所(緯度・経度の区画)を使う
describe('Map (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const PREFIX = 'e2e-map-';

  interface TestUser {
    id: number;
    token: string;
  }

  let sequence = 0;
  const registerUser = async (label: string): Promise<TestUser> => {
    const n = ++sequence;
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        name: `user-${label}`,
        email: `${PREFIX}${label}-${n}-${suffix}@example.com`,
        password: 'password-1234',
      })
      .expect(201);
    return { id: res.body.user.id, token: res.body.accessToken };
  };

  const bearer = (u: TestUser) => `Bearer ${u.token}`;
  const as = (u?: TestUser) => (r: request.Test) =>
    u ? r.set('Authorization', bearer(u)) : r;

  const createSpot = async (
    owner: TestUser,
    input: {
      name?: string;
      latitude?: number | null;
      longitude?: number | null;
      areas?: string[];
      visibility?: 'public' | 'followers' | 'private';
    },
  ): Promise<number> => {
    const res = await request(app.getHttpServer())
      .post('/api/spots')
      .set('Authorization', bearer(owner))
      .send({
        name: input.name ?? '投稿',
        areas: input.areas ?? ['京都府'],
        visibility: input.visibility ?? 'public',
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
      })
      .expect(201);
    return res.body.id as number;
  };

  // 範囲の指定(南西・北東)
  const inBounds = (
    b: { swLat: number; swLng: number; neLat: number; neLng: number },
    extra = '',
    u?: TestUser,
  ) =>
    as(u)(
      request(app.getHttpServer()).get(
        `/api/spots/map?swLat=${b.swLat}&swLng=${b.swLng}&neLat=${b.neLat}&neLng=${b.neLng}${extra}`,
      ),
    );
  const ids = (body: { items: { id: number }[] }) =>
    body.items.map((s) => s.id);

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

  describe('範囲による絞り込み', () => {
    // 区画: 緯度 -50〜-49、経度 100〜101(南半球・東経の海の上。ほかのテストは使わない)
    const box = { swLat: -50, swLng: 100, neLat: -49, neLng: 101 };

    it('範囲の中の投稿だけを返す(外・位置のない投稿は含まない)。感想・写真などは含めない', async () => {
      const owner = await registerUser('box');
      const inside = await createSpot(owner, {
        name: '範囲の中',
        latitude: -49.5,
        longitude: 100.5,
        areas: ['京都府', '大阪府'],
      });
      await createSpot(owner, { latitude: -48, longitude: 100.5 }); // 北にはずれる
      await createSpot(owner, { latitude: -49.5, longitude: 102 }); // 東にはずれる
      await createSpot(owner, { latitude: null, longitude: null }); // 位置なし

      const res = (await inBounds(box).expect(200)).body;
      expect(ids(res)).toEqual([inside]);
      expect(res.truncated).toBe(false);
      expect(res.items[0]).toEqual({
        id: inside,
        name: '範囲の中',
        latitude: -49.5,
        longitude: 100.5,
        areas: ['京都府', '大阪府'],
        visibility: 'public',
      });
    });

    it('範囲の境界(ちょうど)は含む', async () => {
      const owner = await registerUser('edge');
      const sw = await createSpot(owner, { latitude: -50, longitude: 100 });
      const ne = await createSpot(owner, { latitude: -49, longitude: 101 });
      const res = (await inBounds(box).expect(200)).body;
      expect(ids(res)).toEqual(expect.arrayContaining([sw, ne]));
    });

    it('新着順(ID の降順)で返す', async () => {
      const owner = await registerUser('order');
      const a = await createSpot(owner, { latitude: -49.2, longitude: 100.2 });
      const b = await createSpot(owner, { latitude: -49.3, longitude: 100.3 });
      const res = (await inBounds(box).expect(200)).body;
      const mine = ids(res).filter((id: number) => id === a || id === b);
      expect(mine).toEqual([b, a]);
    });

    it('エリアタグで、さらに絞り込める。存在しないエリアは 400', async () => {
      const owner = await registerUser('area');
      const kyoto = await createSpot(owner, {
        latitude: -49.1,
        longitude: 100.1,
        areas: ['京都府'],
      });
      const hokkaido = await createSpot(owner, {
        latitude: -49.1,
        longitude: 100.2,
        areas: ['北海道'],
      });

      const res = (
        await inBounds(box, `&area=${encodeURIComponent('北海道')}`).expect(200)
      ).body;
      expect(ids(res)).toContain(hokkaido);
      expect(ids(res)).not.toContain(kyoto);

      // 空文字は、絞り込まない
      const all = (await inBounds(box, '&area=').expect(200)).body;
      expect(ids(all)).toEqual(expect.arrayContaining([kyoto, hokkaido]));

      const bad = await inBounds(
        box,
        `&area=${encodeURIComponent('火星')}`,
      ).expect(400);
      expect(bad.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('公開範囲(一覧・詳細と同じ規則)', () => {
    // 区画: 緯度 -40〜-39、経度 110〜111
    const box = { swLat: -40, swLng: 110, neLat: -39, neLng: 111 };

    it('未ログインは公開だけ。本人は自分の非公開も。フォロワーは、フォロー中の人のフォロワー限定も見える', async () => {
      const owner = await registerUser('vis-owner');
      const follower = await registerUser('vis-follower');
      const stranger = await registerUser('vis-stranger');
      const pub = await createSpot(owner, {
        latitude: -39.5,
        longitude: 110.5,
        visibility: 'public',
      });
      const fol = await createSpot(owner, {
        latitude: -39.5,
        longitude: 110.6,
        visibility: 'followers',
      });
      const priv = await createSpot(owner, {
        latitude: -39.5,
        longitude: 110.7,
        visibility: 'private',
      });
      await request(app.getHttpServer())
        .post(`/api/users/${owner.id}/follow`)
        .set('Authorization', bearer(follower))
        .expect(200);

      const mine = (a: { items: { id: number }[] }) =>
        ids(a)
          .filter((id: number) => [pub, fol, priv].includes(id))
          .sort((a, b) => a - b);
      expect(mine((await inBounds(box).expect(200)).body)).toEqual([pub]);
      expect(
        mine((await inBounds(box, '', stranger).expect(200)).body),
      ).toEqual([pub]);
      expect(
        mine((await inBounds(box, '', follower).expect(200)).body),
      ).toEqual([pub, fol].sort((a, b) => a - b));
      expect(mine((await inBounds(box, '', owner).expect(200)).body)).toEqual(
        [pub, fol, priv].sort((a, b) => a - b),
      );
    });

    it('トークンを付けたのに不正なら 401(未ログイン扱いにはしない)', async () => {
      await request(app.getHttpServer())
        .get(
          `/api/spots/map?swLat=${box.swLat}&swLng=${box.swLng}&neLat=${box.neLat}&neLng=${box.neLng}`,
        )
        .set('Authorization', 'Bearer invalid')
        .expect(401);
    });
  });

  describe('日付変更線をまたぐ範囲', () => {
    it('南西の経度 > 北東の経度 なら、「南西以東、または、北東以西」の投稿を返す', async () => {
      const owner = await registerUser('antimeridian');
      // 緯度 -30〜-29(ほかのテストは使わない)。東経 179.9 と、西経 179.9(日付変更線の両側)と、遠い 0
      const east = await createSpot(owner, {
        latitude: -29.5,
        longitude: 179.9,
      });
      const west = await createSpot(owner, {
        latitude: -29.5,
        longitude: -179.9,
      });
      const far = await createSpot(owner, { latitude: -29.5, longitude: 0 });

      const crossing = (
        await inBounds({
          swLat: -30,
          swLng: 170,
          neLat: -29,
          neLng: -170,
        }).expect(200)
      ).body;
      expect(ids(crossing)).toEqual(expect.arrayContaining([east, west]));
      expect(ids(crossing)).not.toContain(far);

      // またがない範囲(170〜180)なら、東側だけ
      const eastOnly = (
        await inBounds({
          swLat: -30,
          swLng: 170,
          neLat: -29,
          neLng: 180,
        }).expect(200)
      ).body;
      expect(ids(eastOnly)).toContain(east);
      expect(ids(eastOnly)).not.toContain(west);
    });
  });

  describe('件数の上限(100 件)', () => {
    it('範囲内に 100 件を超えるときは、新しい 100 件にして、truncated を true にする', async () => {
      const owner = await registerUser('limit');
      // 区画: 緯度 -20〜-19、経度 120〜121。API で 101 件作ると遅いため、DB に直接入れる
      await prisma.spot.createMany({
        data: Array.from({ length: 101 }, (_, i) => ({
          userId: owner.id,
          name: `上限-${i}`,
          latitude: -19.5,
          longitude: 120 + i / 1000,
          visibility: 'public' as const,
        })),
      });
      const box = { swLat: -20, swLng: 120, neLat: -19, neLng: 121 };

      const res = (await inBounds(box).expect(200)).body;
      expect(res.items).toHaveLength(100);
      expect(res.truncated).toBe(true);
      // 省かれるのは、いちばん古い 1 件(新着順で 100 件)
      const names = res.items.map((s: { name: string }) => s.name);
      expect(names).not.toContain('上限-0');
      expect(names).toContain('上限-100');

      // ちょうど 100 件なら、truncated は false
      await prisma.spot.deleteMany({
        where: { userId: owner.id, name: '上限-100' },
      });
      const exact = (await inBounds(box).expect(200)).body;
      expect(exact.items).toHaveLength(100);
      expect(exact.truncated).toBe(false);
    });
  });

  describe('入力の検証', () => {
    const ok = 'swLat=0&swLng=0&neLat=1&neLng=1';
    const get = (query: string) =>
      request(app.getHttpServer()).get(`/api/spots/map?${query}`);

    it('範囲の指定がない・数値でない・範囲外なら 400(404 にはならない = :id と混同しない)', async () => {
      const bad = [
        '',
        'swLat=0&swLng=0&neLat=1', // neLng がない
        'swLat=abc&swLng=0&neLat=1&neLng=1',
        'swLat=&swLng=0&neLat=1&neLng=1',
        'swLat=-91&swLng=0&neLat=1&neLng=1',
        'swLat=0&swLng=0&neLat=91&neLng=1',
        'swLat=0&swLng=-181&neLat=1&neLng=1',
        'swLat=0&swLng=0&neLat=1&neLng=181',
        'swLat=NaN&swLng=0&neLat=1&neLng=1',
      ];
      for (const q of bad) {
        const res = await get(q).expect(400);
        expect(res.body.code, q).toBe('VALIDATION_ERROR');
      }
      await get(ok).expect(200);
    });

    it('南西の緯度が北東の緯度より大きいと 400', async () => {
      const res = await get('swLat=5&swLng=0&neLat=1&neLng=1').expect(400);
      expect(res.body.fieldErrors.swLat).toBeDefined();
    });

    it('知らないクエリは 400(whitelist)', async () => {
      await get(`${ok}&foo=1`).expect(400);
    });
  });
});

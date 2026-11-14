import 'dotenv/config';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

// 起動中の MySQL(docker compose up -d db)、マイグレーション適用済みの DB、DATABASE_URL、JWT_SECRET が必要
describe('Spots (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  interface TestUser {
    id: number;
    token: string;
  }

  const registerUser = async (label: string): Promise<TestUser> => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        name: `user-${label}`,
        email: `e2e-spots-${label}-${suffix}@example.com`,
        password: 'password-1234',
      })
      .expect(201);
    return { id: res.body.user.id, token: res.body.accessToken };
  };

  const bearer = (u: TestUser) => `Bearer ${u.token}`;
  const validBody = (overrides: Record<string, unknown> = {}) => ({
    name: '清水寺',
    review: '朝イチがおすすめ',
    address: '京都府京都市東山区清水1-294',
    latitude: 34.9949,
    longitude: 135.785,
    areas: ['京都府'],
    visibility: 'public',
    ...overrides,
  });

  const createSpot = async (
    owner: TestUser,
    overrides: Record<string, unknown> = {},
  ): Promise<number> => {
    const res = await request(app.getHttpServer())
      .post('/api/spots')
      .set('Authorization', bearer(owner))
      .send(validBody(overrides))
      .expect(201);
    return res.body.id as number;
  };

  let owner: TestUser;
  let other: TestUser;
  let follower: TestUser;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    owner = await registerUser('owner');
    other = await registerUser('other');
    follower = await registerUser('follower');
    await prisma.follow.create({
      data: { followerId: follower.id, followeeId: owner.id },
    });
  });

  afterAll(async () => {
    // 投稿・タグ・フォローは、ユーザー削除に連動して消える
    await prisma.user.deleteMany({
      where: { email: { endsWith: `-${suffix}@example.com` } },
    });
    await app.close();
  });

  describe('POST /api/spots', () => {
    it('投稿を作成できる', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/spots')
        .set('Authorization', bearer(owner))
        .send(
          validBody({ areas: ['熊本県', '京都府'], visibility: 'followers' }),
        )
        .expect(201);
      expect(res.body).toMatchObject({
        id: expect.any(Number),
        name: '清水寺',
        review: '朝イチがおすすめ',
        address: '京都府京都市東山区清水1-294',
        latitude: 34.9949,
        longitude: 135.785,
        // エリアタグは都道府県の並び順(JIS コード順)で返す
        areas: ['京都府', '熊本県'],
        visibility: 'followers',
        author: { id: owner.id, name: 'user-owner' },
        isMine: true,
      });
    });

    it('場所名とエリアタグ以外は省略できる', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/spots')
        .set('Authorization', bearer(owner))
        .send({ name: '名前だけ', areas: ['北海道'], visibility: 'private' })
        .expect(201);
      expect(res.body).toMatchObject({
        review: null,
        address: null,
        latitude: null,
        longitude: null,
      });
    });

    it('ログインしていなければ 401', async () => {
      await request(app.getHttpServer())
        .post('/api/spots')
        .send(validBody())
        .expect(401);
    });

    it.each([
      ['場所名が空', { name: '  ' }, 'name'],
      ['場所名が 101 文字', { name: 'あ'.repeat(101) }, 'name'],
      ['住所が 256 文字', { address: 'a'.repeat(256) }, 'address'],
      ['エリアタグが 0 個', { areas: [] }, 'areas'],
      [
        'エリアタグが 4 個',
        { areas: ['北海道', '青森県', '岩手県', '宮城県'] },
        'areas',
      ],
      ['エリアタグが重複', { areas: ['京都府', '京都府'] }, 'areas'],
      ['存在しないエリアタグ', { areas: ['ゴッサム'] }, 'areas'],
      ['公開範囲が不正', { visibility: 'everyone' }, 'visibility'],
      ['緯度だけ指定', { longitude: undefined }, 'longitude'],
      ['緯度が範囲外', { latitude: 91 }, 'latitude'],
      ['経度が範囲外', { longitude: -181 }, 'longitude'],
    ])('入力が不正なら 400: %s', async (_label, overrides, field) => {
      const res = await request(app.getHttpServer())
        .post('/api/spots')
        .set('Authorization', bearer(owner))
        .send(validBody(overrides))
        .expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.fieldErrors).toHaveProperty(field);
    });

    it('想定外の項目(他人の user_id など)は拒否する', async () => {
      await request(app.getHttpServer())
        .post('/api/spots')
        .set('Authorization', bearer(owner))
        .send(validBody({ userId: other.id }))
        .expect(400);
    });

    it('投稿者は常にログイン中のユーザーになる', async () => {
      const id = await createSpot(other);
      const spot = await prisma.spot.findUniqueOrThrow({ where: { id } });
      expect(spot.userId).toBe(other.id);
    });
  });

  describe('GET /api/spots/:id(公開範囲)', () => {
    it('公開投稿は未ログインでも見られる(isMine は false)', async () => {
      const id = await createSpot(owner, { visibility: 'public' });
      const res = await request(app.getHttpServer())
        .get(`/api/spots/${id}`)
        .expect(200);
      expect(res.body.name).toBe('清水寺');
      expect(res.body.isMine).toBe(false);
    });

    it('フォロワー限定: 未ログイン・無関係な人は 404、フォロワーと本人は 200', async () => {
      const id = await createSpot(owner, { visibility: 'followers' });
      const get = (u?: TestUser) => {
        const r = request(app.getHttpServer()).get(`/api/spots/${id}`);
        return u ? r.set('Authorization', bearer(u)) : r;
      };
      await get().expect(404);
      await get(other).expect(404);
      await get(follower).expect(200);
      await get(owner).expect(200);
    });

    it('非公開: 本人だけが見られ、フォロワーでも 404', async () => {
      const id = await createSpot(owner, { visibility: 'private' });
      const get = (u?: TestUser) => {
        const r = request(app.getHttpServer()).get(`/api/spots/${id}`);
        return u ? r.set('Authorization', bearer(u)) : r;
      };
      await get().expect(404);
      await get(other).expect(404);
      await get(follower).expect(404);
      const res = await get(owner).expect(200);
      expect(res.body.isMine).toBe(true);
    });

    it('閲覧できない投稿は、存在しない投稿と同じ応答(存在を知らせない)', async () => {
      const id = await createSpot(owner, { visibility: 'private' });
      const hidden = await request(app.getHttpServer())
        .get(`/api/spots/${id}`)
        .set('Authorization', bearer(other))
        .expect(404);
      const missing = await request(app.getHttpServer())
        .get('/api/spots/2147483647')
        .set('Authorization', bearer(other))
        .expect(404);
      expect(hidden.body).toEqual(missing.body);
    });

    it('フォロー関係は一方向: フォロワー側の投稿は、フォローされた側には見えない', async () => {
      const id = await createSpot(follower, { visibility: 'followers' });
      await request(app.getHttpServer())
        .get(`/api/spots/${id}`)
        .set('Authorization', bearer(owner))
        .expect(404);
    });

    it('不正なトークンは 401(期限切れをクライアントが検知してリフレッシュできる)', async () => {
      const id = await createSpot(owner);
      await request(app.getHttpServer())
        .get(`/api/spots/${id}`)
        .set('Authorization', 'Bearer invalid.token.value')
        .expect(401);
    });

    it.each(['abc', '0', '-1', '99999999999999999999', '1.5'])(
      '不正な ID(%s)は 404',
      async (badId) => {
        await request(app.getHttpServer())
          .get(`/api/spots/${badId}`)
          .expect(404);
      },
    );
  });

  describe('PUT /api/spots/:id', () => {
    it('本人は全項目(エリアタグ含む)を更新できる', async () => {
      const id = await createSpot(owner, { areas: ['京都府', '大阪府'] });
      const res = await request(app.getHttpServer())
        .put(`/api/spots/${id}`)
        .set('Authorization', bearer(owner))
        .send({
          name: '更新後',
          areas: ['沖縄県'],
          visibility: 'private',
        })
        .expect(200);
      expect(res.body).toMatchObject({
        name: '更新後',
        areas: ['沖縄県'],
        visibility: 'private',
        // 省略した項目は消える(全項目の置き換え)
        review: null,
        latitude: null,
      });
      const tags = await prisma.spotTag.count({ where: { spotId: id } });
      expect(tags).toBe(1);
    });

    it('他人の公開投稿は 403、非公開は 404', async () => {
      const publicId = await createSpot(owner, { visibility: 'public' });
      const privateId = await createSpot(owner, { visibility: 'private' });
      const res = await request(app.getHttpServer())
        .put(`/api/spots/${publicId}`)
        .set('Authorization', bearer(other))
        .send(validBody({ name: '乗っ取り' }))
        .expect(403);
      expect(res.body.code).toBe('FORBIDDEN');
      await request(app.getHttpServer())
        .put(`/api/spots/${privateId}`)
        .set('Authorization', bearer(other))
        .send(validBody({ name: '乗っ取り' }))
        .expect(404);
      // 変更されていない
      const spot = await prisma.spot.findUniqueOrThrow({
        where: { id: publicId },
      });
      expect(spot.name).toBe('清水寺');
    });

    it('ログインしていなければ 401、存在しなければ 404、入力が不正なら 400', async () => {
      const id = await createSpot(owner);
      await request(app.getHttpServer())
        .put(`/api/spots/${id}`)
        .send(validBody())
        .expect(401);
      await request(app.getHttpServer())
        .put('/api/spots/2147483647')
        .set('Authorization', bearer(owner))
        .send(validBody())
        .expect(404);
      await request(app.getHttpServer())
        .put(`/api/spots/${id}`)
        .set('Authorization', bearer(owner))
        .send(validBody({ areas: [] }))
        .expect(400);
    });
  });

  describe('DELETE /api/spots/:id', () => {
    it('本人は削除でき、削除後は 404', async () => {
      const id = await createSpot(owner);
      await request(app.getHttpServer())
        .delete(`/api/spots/${id}`)
        .set('Authorization', bearer(owner))
        .expect(204);
      await request(app.getHttpServer()).get(`/api/spots/${id}`).expect(404);
      expect(await prisma.spotTag.count({ where: { spotId: id } })).toBe(0);
    });

    it('他人は削除できない(公開は 403、非公開は 404)', async () => {
      const publicId = await createSpot(owner, { visibility: 'public' });
      const privateId = await createSpot(owner, { visibility: 'private' });
      await request(app.getHttpServer())
        .delete(`/api/spots/${publicId}`)
        .set('Authorization', bearer(other))
        .expect(403);
      await request(app.getHttpServer())
        .delete(`/api/spots/${privateId}`)
        .set('Authorization', bearer(other))
        .expect(404);
      expect(
        await prisma.spot.count({
          where: { id: { in: [publicId, privateId] } },
        }),
      ).toBe(2);
    });

    it('ログインしていなければ 401', async () => {
      const id = await createSpot(owner);
      await request(app.getHttpServer()).delete(`/api/spots/${id}`).expect(401);
    });
  });
});

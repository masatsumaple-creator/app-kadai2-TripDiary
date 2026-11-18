import 'dotenv/config';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { retryOnWriteConflict } from './../src/prisma/retry.js';

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
    await retryOnWriteConflict(() =>
      prisma.user.deleteMany({
        // ファイルごとに異なる接頭辞で、範囲を狭くして削除する。
        // 全ユーザーを走査する条件だと、並列に動く他のテストファイルの書き込みと、ロックが競合してデッドロックになる
        where: {
          AND: [
            { email: { startsWith: 'e2e-spots-' } },
            { email: { endsWith: `-${suffix}@example.com` } },
          ],
        },
      }),
    );
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

  describe('GET /api/spots(一覧)', () => {
    // この describe 専用のエリア。他のテストの投稿と混ざらないので、結果を厳密に検証できる
    const A = '島根県';
    const B = '鳥取県';
    const ids: Record<string, number> = {};

    beforeAll(async () => {
      // 作成順(ID の昇順)
      ids.pubA = await createSpot(owner, { areas: [A], visibility: 'public' });
      ids.folA = await createSpot(owner, {
        areas: [A],
        visibility: 'followers',
      });
      ids.privA = await createSpot(owner, {
        areas: [A],
        visibility: 'private',
      });
      ids.pubB = await createSpot(owner, { areas: [B], visibility: 'public' });
      ids.otherPubA = await createSpot(other, {
        areas: [A],
        visibility: 'public',
      });
      ids.otherPrivA = await createSpot(other, {
        areas: [A],
        visibility: 'private',
      });
      ids.multi = await createSpot(owner, {
        areas: [A, B],
        visibility: 'public',
      });
    });

    const list = (query: string, user?: TestUser) => {
      const r = request(app.getHttpServer()).get(`/api/spots${query}`);
      return user ? r.set('Authorization', bearer(user)) : r;
    };
    const idsOf = async (query: string, user?: TestUser) =>
      (
        (await list(query, user).expect(200)).body.items as { id: number }[]
      ).map((i) => i.id);
    const names = (keys: string[]) => keys.map((k) => ids[k]);

    it('新着順(新しい順)で返し、公開範囲に合うものだけを含む', async () => {
      const q = `?area=${encodeURIComponent(A)}`;
      // 未ログイン: 公開のみ
      expect(await idsOf(q)).toEqual(names(['multi', 'otherPubA', 'pubA']));
      // 無関係なログイン済みユーザー: 公開 + 自分の投稿(非公開を含む)
      expect(await idsOf(q, other)).toEqual(
        names(['multi', 'otherPrivA', 'otherPubA', 'pubA']),
      );
      // フォロワー: 公開 + フォローしている相手のフォロワー限定
      expect(await idsOf(q, follower)).toEqual(
        names(['multi', 'otherPubA', 'folA', 'pubA']),
      );
      // 本人: 自分の投稿はすべて(他人の非公開は含まない)
      expect(await idsOf(q, owner)).toEqual(
        names(['multi', 'otherPubA', 'privA', 'folA', 'pubA']),
      );
    });

    it('エリアタグで絞り込める(複数タグの投稿はどちらでも見つかる)', async () => {
      const b = `?area=${encodeURIComponent(B)}`;
      expect(await idsOf(b)).toEqual(names(['multi', 'pubB']));
    });

    it('絞り込みなしでも、閲覧できない投稿は含まれない', async () => {
      const anon = await idsOf('?limit=50');
      expect(anon).toEqual(expect.arrayContaining(names(['pubB', 'multi'])));
      for (const hidden of ['folA', 'privA', 'otherPrivA']) {
        expect(anon).not.toContain(ids[hidden]);
      }
      const asOther = await idsOf('?limit=50', other);
      expect(asOther).not.toContain(ids.privA);
      expect(asOther).not.toContain(ids.folA);
    });

    it('カーソルでページ送りでき、重複も抜けもない', async () => {
      const q = `area=${encodeURIComponent(A)}`;
      const page1 = (await list(`?${q}&limit=2`, owner).expect(200)).body;
      expect(page1.items.map((i: { id: number }) => i.id)).toEqual(
        names(['multi', 'otherPubA']),
      );
      expect(page1.nextCursor).toBe(ids.otherPubA);

      const page2 = (
        await list(`?${q}&limit=2&cursor=${page1.nextCursor}`, owner).expect(
          200,
        )
      ).body;
      expect(page2.items.map((i: { id: number }) => i.id)).toEqual(
        names(['privA', 'folA']),
      );

      const page3 = (
        await list(`?${q}&limit=2&cursor=${page2.nextCursor}`, owner).expect(
          200,
        )
      ).body;
      expect(page3.items.map((i: { id: number }) => i.id)).toEqual(
        names(['pubA']),
      );
      expect(page3.nextCursor).toBeNull();
    });

    it('ちょうど件数分のときは nextCursor が null', async () => {
      const res = await list(
        `?area=${encodeURIComponent(A)}&limit=5`,
        owner,
      ).expect(200);
      expect(res.body.items).toHaveLength(5);
      expect(res.body.nextCursor).toBeNull();
    });

    it('limit を省略すると 20 件までで返す', async () => {
      const res = await list('').expect(200);
      expect(res.body.items.length).toBeLessThanOrEqual(20);
    });

    it('一覧には要約だけを含める(感想・住所・緯度経度は含まない)', async () => {
      const res = await list(`?area=${encodeURIComponent(B)}`, owner).expect(
        200,
      );
      expect(res.body.items[0]).toEqual({
        id: ids.multi,
        name: '清水寺',
        // エリアは都道府県の並び順(JIS コード順: 鳥取県 31 → 島根県 32)で返す
        areas: [B, A],
        visibility: 'public',
        author: { id: owner.id, name: 'user-owner' },
        isMine: true,
        // 一覧のカードに出すいいね数・コメント数(新しい投稿なので 0)
        likeCount: 0,
        commentCount: 0,
        createdAt: expect.any(String),
      });
    });

    it('該当がなければ空', async () => {
      const res = await list(`?area=${encodeURIComponent('高知県')}`).expect(
        200,
      );
      expect(res.body).toEqual({ items: [], nextCursor: null });
    });

    it('area が空文字なら絞り込まない', async () => {
      expect(await idsOf('?area=&limit=50')).toContain(ids.pubB);
    });

    it.each([
      ['存在しないエリア', '?area=ゴッサム', 'area'],
      ['limit が 0', '?limit=0', 'limit'],
      ['limit が上限超え', '?limit=51', 'limit'],
      ['limit が数字でない', '?limit=abc', 'limit'],
      ['cursor が 0', '?cursor=0', 'cursor'],
      ['cursor が数字でない', '?cursor=abc', 'cursor'],
    ])('クエリが不正なら 400: %s', async (_label, query, field) => {
      const res = await list(encodeURI(query)).expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.fieldErrors).toHaveProperty(field);
    });

    it('想定外のクエリ(userId など)は拒否する', async () => {
      await list(`?userId=${owner.id}`).expect(400);
    });

    it('不正なトークンは 401', async () => {
      await request(app.getHttpServer())
        .get('/api/spots')
        .set('Authorization', 'Bearer invalid.token.value')
        .expect(401);
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

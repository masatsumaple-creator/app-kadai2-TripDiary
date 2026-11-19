import 'dotenv/config';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { retryOnWriteConflict } from './../src/prisma/retry.js';

// マイリスト(訪問済み / 行きたい)の結合テスト。
// 起動中の MySQL(docker compose up -d db)、マイグレーション適用済みの DB、DATABASE_URL、JWT_SECRET が必要
describe('Lists (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const PREFIX = 'e2e-lists-';

  interface TestUser {
    id: number;
    token: string;
  }
  type Visibility = 'public' | 'followers' | 'private';
  type Status = 'visited' | 'wishlist';

  // 呼び出しごとに別のユーザーを作る(同じラベルでも、メールが重複しない)
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
    visibility: Visibility = 'public',
    name = '投稿',
  ): Promise<number> => {
    const res = await request(app.getHttpServer())
      .post('/api/spots')
      .set('Authorization', bearer(owner))
      .send({ name, areas: ['京都府'], visibility })
      .expect(201);
    return res.body.id as number;
  };

  const put = (id: number, status: unknown, u?: TestUser) =>
    as(u)(
      request(app.getHttpServer())
        .put(`/api/spots/${id}/list`)
        .send({ status }),
    );
  const remove = (id: number, u?: TestUser) =>
    as(u)(request(app.getHttpServer()).delete(`/api/spots/${id}/list`));
  const myList = (query = '', u?: TestUser) =>
    as(u)(request(app.getHttpServer()).get(`/api/me/list${query}`));
  const idsOf = async (status: Status, u: TestUser, extra = '') =>
    (
      (await myList(`?status=${status}${extra}`, u).expect(200)).body.items as {
        id: number;
      }[]
    ).map((i) => i.id);
  const getSpot = (id: number, u?: TestUser) =>
    as(u)(request(app.getHttpServer()).get(`/api/spots/${id}`));
  const follow = (who: TestUser, targetId: number) =>
    request(app.getHttpServer())
      .post(`/api/users/${targetId}/follow`)
      .set('Authorization', bearer(who))
      .expect(200);
  const unfollow = (who: TestUser, targetId: number) =>
    request(app.getHttpServer())
      .delete(`/api/users/${targetId}/follow`)
      .set('Authorization', bearer(who))
      .expect(200);
  const setVisibility = (owner: TestUser, id: number, visibility: Visibility) =>
    request(app.getHttpServer())
      .put(`/api/spots/${id}`)
      .set('Authorization', bearer(owner))
      .send({ name: '投稿', areas: ['京都府'], visibility })
      .expect(200);

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
    // ファイルごとに異なる接頭辞で、範囲を狭くして削除する(並列に動く他のファイルとのデッドロックを避ける)
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

  describe('自分の投稿は、自動で「訪問済み」', () => {
    it('投稿を作ると、自分の訪問済みに入る(詳細の listStatus も visited)', async () => {
      const me = await registerUser('me');
      const id = await createSpot(me);
      expect(await idsOf('visited', me)).toEqual([id]);
      expect(await idsOf('wishlist', me)).toEqual([]);
      expect((await getSpot(id, me).expect(200)).body.listStatus).toBe(
        'visited',
      );
    });

    it('非公開・フォロワー限定の自分の投稿も、訪問済みに入る', async () => {
      const me = await registerUser('me');
      const open = await createSpot(me, 'public');
      const followersOnly = await createSpot(me, 'followers');
      const secret = await createSpot(me, 'private');
      expect(await idsOf('visited', me)).toEqual([secret, followersOnly, open]);
    });

    it('投稿の作成と、リストへの登録は、一緒に成り立つ(行がある)', async () => {
      const me = await registerUser('me');
      const id = await createSpot(me);
      const row = await prisma.userSpot.findUniqueOrThrow({
        where: { userId_spotId: { userId: me.id, spotId: id } },
      });
      expect(row.status).toBe('visited');
    });

    it('自分の投稿は、状態を変えられず、リストから外せない(400)', async () => {
      const me = await registerUser('me');
      const id = await createSpot(me);
      const changed = await put(id, 'wishlist', me).expect(400);
      expect(changed.body.code).toBe('OWN_SPOT_IN_LIST');
      const removed = await remove(id, me).expect(400);
      expect(removed.body.code).toBe('OWN_SPOT_IN_LIST');
      expect(await idsOf('visited', me)).toEqual([id]);
    });

    it('投稿を削除すると、リストからも消える。ユーザーを削除すると、そのユーザーのリストも消える', async () => {
      const me = await registerUser('me');
      const other = await registerUser('other');
      const id = await createSpot(other);
      await put(id, 'wishlist', me).expect(200);
      await request(app.getHttpServer())
        .delete(`/api/spots/${id}`)
        .set('Authorization', bearer(other))
        .expect(204);
      expect(await idsOf('wishlist', me)).toEqual([]);
      expect(await prisma.userSpot.count({ where: { spotId: id } })).toBe(0);

      const gone = await registerUser('gone');
      const id2 = await createSpot(other);
      await put(id2, 'visited', gone).expect(200);
      await prisma.user.delete({ where: { id: gone.id } });
      expect(await prisma.userSpot.count({ where: { userId: gone.id } })).toBe(
        0,
      );
    });
  });

  describe('PUT /api/spots/:id/list(追加・変更)', () => {
    it('他人の投稿を「行きたい」で入れ、「訪問済み」に変えられる。同時に 2 つの状態にはならない', async () => {
      const me = await registerUser('me');
      const author = await registerUser('author');
      const id = await createSpot(author);

      expect((await put(id, 'wishlist', me).expect(200)).body).toEqual({
        status: 'wishlist',
      });
      expect(await idsOf('wishlist', me)).toEqual([id]);
      expect((await getSpot(id, me).expect(200)).body.listStatus).toBe(
        'wishlist',
      );

      expect((await put(id, 'visited', me).expect(200)).body).toEqual({
        status: 'visited',
      });
      expect(await idsOf('visited', me)).toEqual([id]);
      expect(await idsOf('wishlist', me)).toEqual([]);
      expect(
        await prisma.userSpot.count({ where: { userId: me.id, spotId: id } }),
      ).toBe(1);
    });

    it('いきなり「訪問済み」で入れることもでき、「行きたい」に戻すこともできる', async () => {
      const me = await registerUser('me');
      const author = await registerUser('author');
      const id = await createSpot(author);
      await put(id, 'visited', me).expect(200);
      expect(await idsOf('visited', me)).toContain(id);
      await put(id, 'wishlist', me).expect(200);
      expect(await idsOf('wishlist', me)).toEqual([id]);
    });

    it('同じ状態で何度実行しても同じ結果。同時に実行しても 1 行だけになる', async () => {
      const me = await registerUser('me');
      const author = await registerUser('author');
      const id = await createSpot(author);
      await put(id, 'wishlist', me).expect(200);
      expect((await put(id, 'wishlist', me).expect(200)).body).toEqual({
        status: 'wishlist',
      });
      const results = await Promise.all(
        Array.from({ length: 5 }, () => put(id, 'visited', me)),
      );
      expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
      expect(
        await prisma.userSpot.count({ where: { userId: me.id, spotId: id } }),
      ).toBe(1);
    });

    it.each([
      ['不正な値', 'done'],
      ['空', ''],
      ['未指定', undefined],
      ['文字列でない', 1],
    ])('状態が不正なら 400: %s', async (_label, status) => {
      const me = await registerUser('me');
      const author = await registerUser('author');
      const id = await createSpot(author);
      const res = await put(id, status, me).expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.fieldErrors).toHaveProperty('status');
    });

    it('想定外の項目(他人の userId など)は拒否する。リストは常にログイン中のユーザーのもの', async () => {
      const me = await registerUser('me');
      const other = await registerUser('other');
      const author = await registerUser('author');
      const id = await createSpot(author);
      await request(app.getHttpServer())
        .put(`/api/spots/${id}/list`)
        .set('Authorization', bearer(me))
        .send({ status: 'wishlist', userId: other.id })
        .expect(400);
      await put(id, 'wishlist', me).expect(200);
      expect(await idsOf('wishlist', other)).toEqual([]);
    });

    it('ログインしていなければ 401', async () => {
      const author = await registerUser('author');
      const id = await createSpot(author);
      await put(id, 'wishlist').expect(401);
      await remove(id).expect(401);
      await myList().expect(401);
    });

    it('存在しない投稿・不正な ID は 404', async () => {
      const me = await registerUser('me');
      await put(2147483647, 'wishlist', me).expect(404);
      await remove(2147483647, me).expect(404);
      for (const bad of ['abc', '0', '-1']) {
        await request(app.getHttpServer())
          .put(`/api/spots/${bad}/list`)
          .set('Authorization', bearer(me))
          .send({ status: 'wishlist' })
          .expect(404);
      }
    });

    it('閲覧できない投稿は、リストに入れられない(404。存在を知らせない)', async () => {
      const me = await registerUser('me');
      const author = await registerUser('author');
      const secret = await createSpot(author, 'private');
      const followersOnly = await createSpot(author, 'followers');
      const hidden = await put(secret, 'wishlist', me).expect(404);
      const missing = await put(2147483647, 'wishlist', me).expect(404);
      expect(hidden.body).toEqual(missing.body);
      await put(followersOnly, 'wishlist', me).expect(404);
      await remove(secret, me).expect(404);
      expect(await prisma.userSpot.count({ where: { userId: me.id } })).toBe(0);
    });

    it('フォロー後は、フォロワー限定の投稿を入れられる', async () => {
      const me = await registerUser('me');
      const author = await registerUser('author');
      const id = await createSpot(author, 'followers');
      await put(id, 'wishlist', me).expect(404);
      await follow(me, author.id);
      await put(id, 'wishlist', me).expect(200);
      expect(await idsOf('wishlist', me)).toEqual([id]);
    });
  });

  describe('DELETE /api/spots/:id/list(外す)', () => {
    it('外すと、リストから消え、詳細の listStatus が null に戻る。何度実行しても同じ', async () => {
      const me = await registerUser('me');
      const author = await registerUser('author');
      const id = await createSpot(author);
      await put(id, 'wishlist', me).expect(200);
      expect((await remove(id, me).expect(200)).body).toEqual({ status: null });
      expect(await idsOf('wishlist', me)).toEqual([]);
      expect((await getSpot(id, me).expect(200)).body.listStatus).toBeNull();
      expect((await remove(id, me).expect(200)).body).toEqual({ status: null });
    });

    it('自分のリストから外しても、他の人のリストには影響しない', async () => {
      const a = await registerUser('a');
      const b = await registerUser('b');
      const author = await registerUser('author');
      const id = await createSpot(author);
      await put(id, 'wishlist', a).expect(200);
      await put(id, 'wishlist', b).expect(200);
      await remove(id, a).expect(200);
      expect(await idsOf('wishlist', b)).toEqual([id]);
    });
  });

  describe('GET /api/me/list(マイリスト)', () => {
    it('状態ごとに、リストに入れた新しい順で返し、件数(counts)も返す', async () => {
      const me = await registerUser('me');
      const author = await registerUser('author');
      const s1 = await createSpot(author);
      const s2 = await createSpot(author);
      const s3 = await createSpot(author);
      const mine = await createSpot(me);
      // 入れた順: s2 → s1 → s3(投稿の新しさとは違う順で入れる)
      await put(s2, 'wishlist', me).expect(200);
      await put(s1, 'wishlist', me).expect(200);
      await put(s3, 'visited', me).expect(200);

      expect(await idsOf('wishlist', me)).toEqual([s1, s2]);
      expect(await idsOf('visited', me)).toEqual([s3, mine]);
      const res = (await myList('?status=wishlist', me).expect(200)).body;
      expect(res.counts).toEqual({ visited: 2, wishlist: 2 });
    });

    it('status を省略すると visited。不正な値は 400', async () => {
      const me = await registerUser('me');
      const mine = await createSpot(me);
      const res = (await myList('', me).expect(200)).body;
      expect(res.items.map((i: { id: number }) => i.id)).toEqual([mine]);
      const bad = await myList('?status=done', me).expect(400);
      expect(bad.body.fieldErrors).toHaveProperty('status');
    });

    it('一覧の項目は、投稿の一覧と同じ要約(いいね数・コメント数を含む。感想などは含まない)', async () => {
      const me = await registerUser('me');
      const author = await registerUser('author');
      const id = await createSpot(author, 'public', '清水寺');
      await put(id, 'wishlist', me).expect(200);
      const item = (await myList('?status=wishlist', me).expect(200)).body
        .items[0];
      expect(item).toEqual({
        id,
        name: '清水寺',
        areas: ['京都府'],
        visibility: 'public',
        author: { id: author.id, name: 'user-author' },
        isMine: false,
        likeCount: 0,
        commentCount: 0,
        coverPhotoUrl: null,
        createdAt: expect.any(String),
      });
    });

    it('リストは本人だけのもの: 他の人のリストは見えず、同じ投稿を入れても混ざらない', async () => {
      const a = await registerUser('a');
      const b = await registerUser('b');
      const author = await registerUser('author');
      const id = await createSpot(author);
      await put(id, 'wishlist', a).expect(200);
      expect(await idsOf('wishlist', b)).toEqual([]);
      expect(
        (await myList('?status=wishlist', b).expect(200)).body.counts.wishlist,
      ).toBe(0);
    });

    it('カーソルでページ送りでき、重複も抜けもない。ちょうど件数分のときは nextCursor が null', async () => {
      const me = await registerUser('me');
      const author = await registerUser('author');
      const spots: number[] = [];
      for (let i = 0; i < 5; i++) spots.push(await createSpot(author));
      for (const id of spots) await put(id, 'wishlist', me).expect(200);

      // 入れた新しい順: 5 → 1
      const expected = [...spots].reverse();
      const p1 = (await myList('?status=wishlist&limit=2', me).expect(200))
        .body;
      expect(p1.items.map((i: { id: number }) => i.id)).toEqual(
        expected.slice(0, 2),
      );
      expect(p1.nextCursor).not.toBeNull();
      const p2 = (
        await myList(
          `?status=wishlist&limit=2&cursor=${p1.nextCursor}`,
          me,
        ).expect(200)
      ).body;
      expect(p2.items.map((i: { id: number }) => i.id)).toEqual(
        expected.slice(2, 4),
      );
      const p3 = (
        await myList(
          `?status=wishlist&limit=2&cursor=${p2.nextCursor}`,
          me,
        ).expect(200)
      ).body;
      expect(p3.items.map((i: { id: number }) => i.id)).toEqual(
        expected.slice(4),
      );
      expect(p3.nextCursor).toBeNull();

      const exact = (await myList('?status=wishlist&limit=5', me).expect(200))
        .body;
      expect(exact.items).toHaveLength(5);
      expect(exact.nextCursor).toBeNull();
    });

    it.each([
      ['limit が 0', '?limit=0'],
      ['limit が上限超え', '?limit=51'],
      ['cursor が数字でない', '?cursor=abc'],
      ['想定外のクエリ', '?foo=1'],
    ])('クエリが不正なら 400: %s', async (_label, query) => {
      const me = await registerUser('me');
      await myList(query, me).expect(400);
    });
  });

  describe('閲覧できなくなった投稿は、リストに見えない(権限の流出を防ぐ)', () => {
    it('投稿者が非公開に変えると、リストにも件数にも出ない。公開に戻すと、また出る', async () => {
      const me = await registerUser('me');
      const author = await registerUser('author');
      const id = await createSpot(author, 'public');
      await put(id, 'wishlist', me).expect(200);
      expect(await idsOf('wishlist', me)).toEqual([id]);

      await setVisibility(author, id, 'private');
      const hidden = (await myList('?status=wishlist', me).expect(200)).body;
      expect(hidden.items).toEqual([]);
      expect(hidden.counts.wishlist).toBe(0);
      // 詳細も 404(リストの行が残っていても、投稿の内容は見えない)
      await getSpot(id, me).expect(404);
      expect(
        await prisma.userSpot.count({ where: { userId: me.id, spotId: id } }),
      ).toBe(1);

      await setVisibility(author, id, 'public');
      expect(await idsOf('wishlist', me)).toEqual([id]);
    });

    it('フォロー中の人のフォロワー限定の投稿は、フォローを解除すると、リストから見えなくなる', async () => {
      const me = await registerUser('me');
      const author = await registerUser('author');
      const id = await createSpot(author, 'followers');
      await follow(me, author.id);
      await put(id, 'visited', me).expect(200);
      expect(await idsOf('visited', me)).toContain(id);

      await unfollow(me, author.id);
      const res = (await myList('?status=visited', me).expect(200)).body;
      expect(res.items.map((i: { id: number }) => i.id)).not.toContain(id);
      expect(res.counts.visited).toBe(0);

      await follow(me, author.id);
      expect(await idsOf('visited', me)).toContain(id);
    });

    it('自分の投稿は、非公開に変えても、訪問済みに残る', async () => {
      const me = await registerUser('me');
      const id = await createSpot(me, 'public');
      await setVisibility(me, id, 'private');
      expect(await idsOf('visited', me)).toEqual([id]);
    });
  });
});

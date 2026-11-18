import 'dotenv/config';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

// 起動中の MySQL(docker compose up -d db)、マイグレーション適用済みの DB、DATABASE_URL、JWT_SECRET が必要
describe('Follows / Users (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  interface TestUser {
    id: number;
    token: string;
  }

  // 呼び出しごとに別のユーザーを作る(同じラベルでも、メールが重複しない)
  let sequence = 0;
  const registerUser = async (label: string): Promise<TestUser> => {
    const n = ++sequence;
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        name: `user-${label}`,
        email: `e2e-follows-${label}-${n}-${suffix}@example.com`,
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
    overrides: Record<string, unknown> = {},
  ): Promise<number> => {
    const res = await request(app.getHttpServer())
      .post('/api/spots')
      .set('Authorization', bearer(owner))
      .send({
        name: '投稿',
        areas: ['京都府'],
        visibility: 'public',
        ...overrides,
      })
      .expect(201);
    return res.body.id as number;
  };

  const follow = (who: TestUser, targetId: number) =>
    request(app.getHttpServer())
      .post(`/api/users/${targetId}/follow`)
      .set('Authorization', bearer(who));
  const unfollow = (who: TestUser, targetId: number) =>
    request(app.getHttpServer())
      .delete(`/api/users/${targetId}/follow`)
      .set('Authorization', bearer(who));
  const profile = (id: number, viewer?: TestUser) =>
    as(viewer)(request(app.getHttpServer()).get(`/api/users/${id}`));
  const list = (query: string, viewer?: TestUser) =>
    as(viewer)(request(app.getHttpServer()).get(`/api/spots${query}`));
  const idsOf = async (query: string, viewer?: TestUser) =>
    (
      (await list(query, viewer).expect(200)).body.items as { id: number }[]
    ).map((i) => i.id);

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
    await prisma.user.deleteMany({
      // ファイルごとに異なる接頭辞で、範囲を狭くして削除する。
      // 全ユーザーを走査する条件だと、並列に動く他のテストファイルの書き込みと、ロックが競合してデッドロックになる
      where: {
        AND: [
          { email: { startsWith: 'e2e-follows-' } },
          { email: { endsWith: `-${suffix}@example.com` } },
        ],
      },
    });
    await app.close();
  });

  describe('POST/DELETE /api/users/:id/follow', () => {
    it('フォローすると、フォロワー数が増え、フォロー中になる', async () => {
      const a = await registerUser('a');
      const b = await registerUser('b');
      const res = await follow(a, b.id).expect(200);
      expect(res.body).toEqual({ isFollowing: true, followerCount: 1 });
      const p = (await profile(b.id, a).expect(200)).body;
      expect(p).toMatchObject({ followerCount: 1, isFollowing: true });
      expect((await profile(a.id, a).expect(200)).body.followingCount).toBe(1);
    });

    it('何度フォローしても結果は同じ(重複しない)', async () => {
      const a = await registerUser('a');
      const b = await registerUser('b');
      await follow(a, b.id).expect(200);
      const second = await follow(a, b.id).expect(200);
      expect(second.body).toEqual({ isFollowing: true, followerCount: 1 });
      expect(await prisma.follow.count({ where: { followeeId: b.id } })).toBe(
        1,
      );
    });

    it('同時に何度フォローしても、エラーにならず 1 件だけになる', async () => {
      const a = await registerUser('a');
      const b = await registerUser('b');
      const results = await Promise.all(
        Array.from({ length: 5 }, () => follow(a, b.id)),
      );
      expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
      expect(await prisma.follow.count({ where: { followeeId: b.id } })).toBe(
        1,
      );
    });

    it('解除すると、フォロワー数が減る。フォローしていなくても同じ結果', async () => {
      const a = await registerUser('a');
      const b = await registerUser('b');
      await follow(a, b.id).expect(200);
      const first = await unfollow(a, b.id).expect(200);
      expect(first.body).toEqual({ isFollowing: false, followerCount: 0 });
      const second = await unfollow(a, b.id).expect(200);
      expect(second.body).toEqual({ isFollowing: false, followerCount: 0 });
    });

    it('フォローは一方向。フォローされた側のフォロー数は増えない', async () => {
      const a = await registerUser('a');
      const b = await registerUser('b');
      await follow(a, b.id).expect(200);
      const pb = (await profile(b.id, b).expect(200)).body;
      expect(pb).toMatchObject({
        followerCount: 1,
        followingCount: 0,
        isFollowing: false,
      });
    });

    it('自分自身はフォローできない(400)', async () => {
      const a = await registerUser('a');
      const res = await follow(a, a.id).expect(400);
      expect(res.body.code).toBe('CANNOT_FOLLOW_SELF');
      expect(await prisma.follow.count({ where: { followeeId: a.id } })).toBe(
        0,
      );
    });

    it('存在しないユーザーは 404。不正な ID も 404', async () => {
      const a = await registerUser('a');
      await follow(a, 2147483647).expect(404);
      await unfollow(a, 2147483647).expect(404);
      for (const bad of ['abc', '0', '-1', '99999999999999999999']) {
        await request(app.getHttpServer())
          .post(`/api/users/${bad}/follow`)
          .set('Authorization', bearer(a))
          .expect(404);
      }
    });

    it('ログインしていなければ 401(フォローも解除も)', async () => {
      const b = await registerUser('b');
      await request(app.getHttpServer())
        .post(`/api/users/${b.id}/follow`)
        .expect(401);
      await request(app.getHttpServer())
        .delete(`/api/users/${b.id}/follow`)
        .expect(401);
    });

    it('フォロー関係は、リクエストを送ったユーザー本人のものにだけ作られる', async () => {
      const a = await registerUser('a');
      const b = await registerUser('b');
      const c = await registerUser('c');
      await follow(a, b.id).expect(200);
      // 他人の代わりにフォローしたり、他人のフォローを解除したりする手段がない
      await unfollow(c, b.id).expect(200);
      expect(
        await prisma.follow.count({
          where: { followerId: a.id, followeeId: b.id },
        }),
      ).toBe(1);
    });
  });

  describe('公開範囲「フォロワー限定」への影響(実際のフォロー操作で確認)', () => {
    it('フォローすると見られるようになり、解除すると再び見られなくなる(詳細・一覧)', async () => {
      const author = await registerUser('author');
      const reader = await registerUser('reader');
      const id = await createSpot(author, {
        areas: ['高知県'],
        visibility: 'followers',
      });
      const detail = (u: TestUser) =>
        request(app.getHttpServer())
          .get(`/api/spots/${id}`)
          .set('Authorization', bearer(u));

      await detail(reader).expect(404);
      expect(await idsOf('?area=高知県&limit=50', reader)).not.toContain(id);

      await follow(reader, author.id).expect(200);
      await detail(reader).expect(200);
      expect(await idsOf('?area=高知県&limit=50', reader)).toContain(id);

      await unfollow(reader, author.id).expect(200);
      await detail(reader).expect(404);
      expect(await idsOf('?area=高知県&limit=50', reader)).not.toContain(id);
    });

    it('フォローしても、非公開の投稿は見られない', async () => {
      const author = await registerUser('author');
      const reader = await registerUser('reader');
      const id = await createSpot(author, { visibility: 'private' });
      await follow(reader, author.id).expect(200);
      await request(app.getHttpServer())
        .get(`/api/spots/${id}`)
        .set('Authorization', bearer(reader))
        .expect(404);
    });

    it('相手からのフォローでは、自分のフォロワー限定の投稿は見られない(一方向)', async () => {
      const author = await registerUser('author');
      const reader = await registerUser('reader');
      const id = await createSpot(author, { visibility: 'followers' });
      // 投稿者が読者をフォローしても、読者は投稿者をフォローしたことにならない
      await follow(author, reader.id).expect(200);
      await request(app.getHttpServer())
        .get(`/api/spots/${id}`)
        .set('Authorization', bearer(reader))
        .expect(404);
    });
  });

  describe('GET /api/users/:id(プロフィール)', () => {
    it('未ログインでも見られ、個人情報(メールなど)は含まない', async () => {
      const a = await registerUser('profile');
      const res = await profile(a.id).expect(200);
      expect(res.body).toEqual({
        id: a.id,
        name: 'user-profile',
        followerCount: 0,
        followingCount: 0,
        spotCount: 0,
        isMe: false,
        isFollowing: false,
      });
      expect(JSON.stringify(res.body)).not.toContain('@');
    });

    it('自分のプロフィールは isMe が true', async () => {
      const a = await registerUser('me');
      expect((await profile(a.id, a).expect(200)).body.isMe).toBe(true);
    });

    it('投稿数は、閲覧者が見られる投稿だけを数える', async () => {
      const author = await registerUser('author');
      const stranger = await registerUser('stranger');
      const follower = await registerUser('follower');
      await createSpot(author, { visibility: 'public' });
      await createSpot(author, { visibility: 'followers' });
      await createSpot(author, { visibility: 'private' });
      await follow(follower, author.id).expect(200);

      const count = async (v?: TestUser) =>
        (await profile(author.id, v).expect(200)).body.spotCount;
      expect(await count()).toBe(1); // 未ログイン: 公開のみ
      expect(await count(stranger)).toBe(1); // 無関係: 公開のみ
      expect(await count(follower)).toBe(2); // フォロワー: 公開 + フォロワー限定
      expect(await count(author)).toBe(3); // 本人: すべて
    });

    it('存在しないユーザーと不正な ID は 404。不正なトークンは 401', async () => {
      await profile(2147483647).expect(404);
      await request(app.getHttpServer()).get('/api/users/abc').expect(404);
      await request(app.getHttpServer())
        .get('/api/users/1')
        .set('Authorization', 'Bearer invalid.token.value')
        .expect(401);
    });
  });

  describe('GET /api/spots?following=true(フォロー中一覧)', () => {
    it('フォロー中の人の、閲覧できる投稿だけを新着順で返す。自分の投稿は含まない', async () => {
      const me = await registerUser('me');
      const followed = await registerUser('followed');
      const notFollowed = await registerUser('notfollowed');
      // このテスト専用のエリア
      const area = '福井県';
      const mine = await createSpot(me, { areas: [area] });
      const f1 = await createSpot(followed, {
        areas: [area],
        visibility: 'public',
      });
      const f2 = await createSpot(followed, {
        areas: [area],
        visibility: 'followers',
      });
      const fPriv = await createSpot(followed, {
        areas: [area],
        visibility: 'private',
      });
      const other = await createSpot(notFollowed, { areas: [area] });
      await follow(me, followed.id).expect(200);

      const ids = await idsOf(
        `?following=true&area=${encodeURIComponent(area)}`,
        me,
      );
      // フォロー中の公開 + フォロワー限定(フォローしているので見える)。新しい順
      expect(ids).toEqual([f2, f1]);
      for (const hidden of [mine, fPriv, other])
        expect(ids).not.toContain(hidden);
    });

    it('フォローを解除すると、その人の投稿は出なくなる', async () => {
      const me = await registerUser('me');
      const followed = await registerUser('followed');
      const id = await createSpot(followed, { areas: ['福井県'] });
      await follow(me, followed.id).expect(200);
      expect(await idsOf('?following=true&area=福井県', me)).toContain(id);
      await unfollow(me, followed.id).expect(200);
      expect(await idsOf('?following=true&area=福井県', me)).not.toContain(id);
    });

    it('誰もフォローしていなければ、空', async () => {
      const me = await registerUser('lonely');
      const res = await list('?following=true', me).expect(200);
      expect(res.body).toEqual({ items: [], nextCursor: null });
    });

    it('ページ送りできる(重複・抜けなし)', async () => {
      const me = await registerUser('me');
      const followed = await registerUser('followed');
      const created: number[] = [];
      for (let i = 0; i < 5; i++)
        created.push(await createSpot(followed, { areas: ['福井県'] }));
      await follow(me, followed.id).expect(200);

      const seen: number[] = [];
      let cursor: number | null = null;
      for (let page = 0; page < 5; page++) {
        const q: string = `?following=true&area=福井県&limit=2${cursor ? `&cursor=${cursor}` : ''}`;
        const body: { items: { id: number }[]; nextCursor: number | null } = (
          await list(q, me).expect(200)
        ).body;
        seen.push(...body.items.map((i) => i.id));
        cursor = body.nextCursor;
        if (cursor === null) break;
      }
      const mine = seen.filter((id) => created.includes(id));
      expect(mine).toEqual([...created].reverse());
      expect(new Set(seen).size).toBe(seen.length);
    });

    it('ログインしていなければ 401。following=false は絞り込まない。不正な値は 400', async () => {
      await list('?following=true').expect(401);
      await list('?following=false').expect(200);
      const res = await list('?following=maybe').expect(400);
      expect(res.body.fieldErrors).toHaveProperty('following');
    });
  });

  describe('GET /api/spots?author=(ユーザーの投稿一覧)', () => {
    it('そのユーザーの、閲覧者が見られる投稿だけを返す', async () => {
      const author = await registerUser('author');
      const follower = await registerUser('follower');
      const stranger = await registerUser('stranger');
      const noise = await registerUser('noise');
      const pub = await createSpot(author, { visibility: 'public' });
      const fol = await createSpot(author, { visibility: 'followers' });
      const priv = await createSpot(author, { visibility: 'private' });
      const noiseSpot = await createSpot(noise);
      await follow(follower, author.id).expect(200);

      const q = `?author=${author.id}`;
      expect(await idsOf(q)).toEqual([pub]);
      expect(await idsOf(q, stranger)).toEqual([pub]);
      expect(await idsOf(q, follower)).toEqual([fol, pub]);
      expect(await idsOf(q, author)).toEqual([priv, fol, pub]);
      expect(await idsOf(q, author)).not.toContain(noiseSpot);
    });

    it('存在しない author は空(404 にしない)。不正な値は 400。エリアとも組み合わせられる', async () => {
      expect((await list('?author=2147483647').expect(200)).body.items).toEqual(
        [],
      );
      const res = await list('?author=abc').expect(400);
      expect(res.body.fieldErrors).toHaveProperty('author');

      const author = await registerUser('author');
      const kyoto = await createSpot(author, { areas: ['京都府'] });
      await createSpot(author, { areas: ['福井県'] });
      const ids = await idsOf(
        `?author=${author.id}&area=${encodeURIComponent('京都府')}`,
      );
      expect(ids).toEqual([kyoto]);
    });
  });

  it('ユーザーが削除されると、そのユーザーのフォロー関係も消える(連動して削除)', async () => {
    const a = await registerUser('cascade-a');
    const b = await registerUser('cascade-b');
    await follow(a, b.id).expect(200);
    await prisma.user.delete({ where: { id: a.id } });
    expect(await prisma.follow.count({ where: { followeeId: b.id } })).toBe(0);
    expect((await profile(b.id).expect(200)).body.followerCount).toBe(0);
  });
});

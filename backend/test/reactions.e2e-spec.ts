import 'dotenv/config';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { retryOnWriteConflict } from './../src/prisma/retry.js';

// いいね・コメントの結合テスト。
// 起動中の MySQL(docker compose up -d db)、マイグレーション適用済みの DB、DATABASE_URL、JWT_SECRET が必要
describe('Likes / Comments (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const PREFIX = 'e2e-reactions-';

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
    visibility: 'public' | 'followers' | 'private' = 'public',
  ): Promise<number> => {
    const res = await request(app.getHttpServer())
      .post('/api/spots')
      .set('Authorization', bearer(owner))
      .send({ name: '投稿', areas: ['京都府'], visibility })
      .expect(201);
    return res.body.id as number;
  };

  const like = (id: number, u?: TestUser) =>
    as(u)(request(app.getHttpServer()).post(`/api/spots/${id}/like`));
  const unlike = (id: number, u?: TestUser) =>
    as(u)(request(app.getHttpServer()).delete(`/api/spots/${id}/like`));
  const getSpot = (id: number, u?: TestUser) =>
    as(u)(request(app.getHttpServer()).get(`/api/spots/${id}`));
  const listComments = (id: number, query = '', u?: TestUser) =>
    as(u)(
      request(app.getHttpServer()).get(`/api/spots/${id}/comments${query}`),
    );
  const comment = (id: number, body: unknown, u?: TestUser) =>
    as(u)(
      request(app.getHttpServer())
        .post(`/api/spots/${id}/comments`)
        .send({ body }),
    );
  const deleteComment = (
    id: number,
    commentId: number | string,
    u?: TestUser,
  ) =>
    as(u)(
      request(app.getHttpServer()).delete(
        `/api/spots/${id}/comments/${commentId}`,
      ),
    );
  const follow = (who: TestUser, targetId: number) =>
    request(app.getHttpServer())
      .post(`/api/users/${targetId}/follow`)
      .set('Authorization', bearer(who))
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

  describe('いいね: POST/DELETE /api/spots/:id/like', () => {
    it('いいねすると件数が増え、詳細と一覧にも反映される。取り消すと戻る', async () => {
      const owner = await registerUser('owner');
      const fan = await registerUser('fan');
      const id = await createSpot(owner);

      const liked = await like(id, fan).expect(200);
      expect(liked.body).toEqual({ liked: true, likeCount: 1 });

      const detail = (await getSpot(id, fan).expect(200)).body;
      expect(detail).toMatchObject({ likeCount: 1, liked: true });
      // 他の閲覧者(未ログインを含む)にも件数は見えるが、「いいね済み」は本人だけ
      expect((await getSpot(id).expect(200)).body).toMatchObject({
        likeCount: 1,
        liked: false,
      });
      expect((await getSpot(id, owner).expect(200)).body).toMatchObject({
        likeCount: 1,
        liked: false,
      });
      const fromList = (
        await request(app.getHttpServer()).get(`/api/spots?author=${owner.id}`)
      ).body.items.find((i: { id: number }) => i.id === id);
      expect(fromList.likeCount).toBe(1);

      const unliked = await unlike(id, fan).expect(200);
      expect(unliked.body).toEqual({ liked: false, likeCount: 0 });
      expect((await getSpot(id, fan).expect(200)).body).toMatchObject({
        likeCount: 0,
        liked: false,
      });
    });

    it('何度いいねしても 1 回だけ数える(重複しない)。取り消しも何度でも同じ', async () => {
      const owner = await registerUser('owner');
      const fan = await registerUser('fan');
      const id = await createSpot(owner);
      await like(id, fan).expect(200);
      expect((await like(id, fan).expect(200)).body).toEqual({
        liked: true,
        likeCount: 1,
      });
      await unlike(id, fan).expect(200);
      expect((await unlike(id, fan).expect(200)).body).toEqual({
        liked: false,
        likeCount: 0,
      });
    });

    it('同時に何度いいねしても、エラーにならず 1 件だけになる', async () => {
      const owner = await registerUser('owner');
      const fan = await registerUser('fan');
      const id = await createSpot(owner);
      const results = await Promise.all(
        Array.from({ length: 5 }, () => like(id, fan)),
      );
      expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
      expect(await prisma.like.count({ where: { spotId: id } })).toBe(1);
    });

    it('複数のユーザーのいいねを数える', async () => {
      const owner = await registerUser('owner');
      const a = await registerUser('a');
      const b = await registerUser('b');
      const id = await createSpot(owner);
      await like(id, a).expect(200);
      const res = await like(id, b).expect(200);
      expect(res.body.likeCount).toBe(2);
    });

    it('自分の投稿にはいいねできない(400)', async () => {
      const owner = await registerUser('owner');
      const id = await createSpot(owner);
      const res = await like(id, owner).expect(400);
      expect(res.body.code).toBe('CANNOT_LIKE_OWN_SPOT');
      expect(await prisma.like.count({ where: { spotId: id } })).toBe(0);
    });

    it('ログインしていなければ 401', async () => {
      const owner = await registerUser('owner');
      const id = await createSpot(owner);
      await like(id).expect(401);
      await unlike(id).expect(401);
    });

    it('存在しない投稿・不正な ID は 404', async () => {
      const fan = await registerUser('fan');
      await like(2147483647, fan).expect(404);
      await unlike(2147483647, fan).expect(404);
      for (const bad of ['abc', '0', '-1', '99999999999999999999']) {
        await request(app.getHttpServer())
          .post(`/api/spots/${bad}/like`)
          .set('Authorization', bearer(fan))
          .expect(404);
      }
    });

    it('閲覧できない投稿には、いいねできない(404。存在を知らせない)', async () => {
      const owner = await registerUser('owner');
      const stranger = await registerUser('stranger');
      const secret = await createSpot(owner, 'private');
      const followersOnly = await createSpot(owner, 'followers');

      const hidden = await like(secret, stranger).expect(404);
      const missing = await like(2147483647, stranger).expect(404);
      expect(hidden.body).toEqual(missing.body);
      await like(followersOnly, stranger).expect(404);
      await unlike(secret, stranger).expect(404);
      expect(
        await prisma.like.count({
          where: { spotId: { in: [secret, followersOnly] } },
        }),
      ).toBe(0);
    });

    it('フォロー後は、フォロワー限定の投稿にいいねできる。解除すると再びできない', async () => {
      const owner = await registerUser('owner');
      const reader = await registerUser('reader');
      const id = await createSpot(owner, 'followers');
      await like(id, reader).expect(404);
      await follow(reader, owner.id);
      await like(id, reader).expect(200);
      await request(app.getHttpServer())
        .delete(`/api/users/${owner.id}/follow`)
        .set('Authorization', bearer(reader))
        .expect(200);
      await like(id, reader).expect(404);
    });

    it('投稿を削除すると、いいねも消える(連動して削除)', async () => {
      const owner = await registerUser('owner');
      const fan = await registerUser('fan');
      const id = await createSpot(owner);
      await like(id, fan).expect(200);
      await request(app.getHttpServer())
        .delete(`/api/spots/${id}`)
        .set('Authorization', bearer(owner))
        .expect(204);
      expect(await prisma.like.count({ where: { spotId: id } })).toBe(0);
    });
  });

  describe('コメント: 投稿', () => {
    it('コメントでき、一覧に古い順で出る。本人と投稿者には削除できることが示される', async () => {
      const owner = await registerUser('owner');
      const asker = await registerUser('asker');
      const other = await registerUser('other');
      const id = await createSpot(owner);

      const q = await comment(
        id,
        '来月行く予定です。おすすめの時間帯は?',
        asker,
      ).expect(201);
      expect(q.body).toMatchObject({
        id: expect.any(Number),
        body: '来月行く予定です。おすすめの時間帯は?',
        author: { id: asker.id, name: 'user-asker' },
        canDelete: true,
      });
      // 投稿者も、自分の投稿に返信できる
      const a = await comment(id, '開門直後がおすすめです。', owner).expect(
        201,
      );
      expect(a.body.canDelete).toBe(true);

      // 古い順
      const asAsker = (await listComments(id, '', asker).expect(200)).body;
      expect(asAsker.items.map((c: { id: number }) => c.id)).toEqual([
        q.body.id,
        a.body.id,
      ]);
      expect(asAsker.nextCursor).toBeNull();
      // 削除できるかは閲覧者ごとに違う: 質問者は自分のだけ、投稿者は両方、他人と未ログインはなし
      const canDelete = (r: { body: { items: { canDelete: boolean }[] } }) =>
        r.body.items.map((c) => c.canDelete);
      expect(canDelete({ body: asAsker })).toEqual([true, false]);
      expect(canDelete(await listComments(id, '', owner).expect(200))).toEqual([
        true,
        true,
      ]);
      expect(canDelete(await listComments(id, '', other).expect(200))).toEqual([
        false,
        false,
      ]);
      expect(canDelete(await listComments(id).expect(200))).toEqual([
        false,
        false,
      ]);
    });

    it('コメント数が、詳細と一覧に反映される', async () => {
      const owner = await registerUser('owner');
      const fan = await registerUser('fan');
      const id = await createSpot(owner);
      await comment(id, 'いいですね', fan).expect(201);
      await comment(id, 'また行きたい', fan).expect(201);
      expect((await getSpot(id).expect(200)).body.commentCount).toBe(2);
      const item = (
        await request(app.getHttpServer()).get(`/api/spots?author=${owner.id}`)
      ).body.items.find((i: { id: number }) => i.id === id);
      expect(item.commentCount).toBe(2);
    });

    it('前後の空白は取り除いて保存する。改行や記号はそのまま', async () => {
      const owner = await registerUser('owner');
      const fan = await registerUser('fan');
      const id = await createSpot(owner);
      const res = await comment(id, '  1 行目\n2 行目 <b>&</b>  ', fan).expect(
        201,
      );
      expect(res.body.body).toBe('1 行目\n2 行目 <b>&</b>');
    });

    it.each([
      ['空文字', ''],
      ['空白だけ', '   \n  '],
      ['501 文字', 'あ'.repeat(501)],
      ['文字列でない', 123],
    ])('入力が不正なら 400: %s', async (_label, body) => {
      const owner = await registerUser('owner');
      const fan = await registerUser('fan');
      const id = await createSpot(owner);
      const res = await comment(id, body, fan).expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.fieldErrors).toHaveProperty('body');
      expect(await prisma.comment.count({ where: { spotId: id } })).toBe(0);
    });

    it('500 文字ちょうどは投稿できる', async () => {
      const owner = await registerUser('owner');
      const fan = await registerUser('fan');
      const id = await createSpot(owner);
      await comment(id, 'あ'.repeat(500), fan).expect(201);
    });

    it('想定外の項目(他人の userId など)は拒否する。コメントした人は常にログイン中のユーザー', async () => {
      const owner = await registerUser('owner');
      const fan = await registerUser('fan');
      const other = await registerUser('other');
      const id = await createSpot(owner);
      await request(app.getHttpServer())
        .post(`/api/spots/${id}/comments`)
        .set('Authorization', bearer(fan))
        .send({ body: 'こんにちは', userId: other.id })
        .expect(400);
      const ok = await comment(id, 'こんにちは', fan).expect(201);
      expect(ok.body.author.id).toBe(fan.id);
    });

    it('ログインしていなければ 401', async () => {
      const owner = await registerUser('owner');
      const id = await createSpot(owner);
      await comment(id, 'こんにちは').expect(401);
    });

    it('閲覧できない投稿には、コメントできない・読めない(404)', async () => {
      const owner = await registerUser('owner');
      const stranger = await registerUser('stranger');
      const secret = await createSpot(owner, 'private');
      const followersOnly = await createSpot(owner, 'followers');
      await comment(secret, 'こんにちは', stranger).expect(404);
      await comment(followersOnly, 'こんにちは', stranger).expect(404);
      await listComments(secret, '', stranger).expect(404);
      await listComments(secret).expect(404);
      await listComments(followersOnly).expect(404);
      // 本人は、非公開の自分の投稿に書ける・読める
      await comment(secret, 'メモ', owner).expect(201);
      expect(
        (await listComments(secret, '', owner).expect(200)).body.items,
      ).toHaveLength(1);
    });

    it('フォロー後は、フォロワー限定の投稿にコメントできる', async () => {
      const owner = await registerUser('owner');
      const reader = await registerUser('reader');
      const id = await createSpot(owner, 'followers');
      await comment(id, 'こんにちは', reader).expect(404);
      await follow(reader, owner.id);
      await comment(id, 'こんにちは', reader).expect(201);
      expect(
        (await listComments(id, '', reader).expect(200)).body.items,
      ).toHaveLength(1);
    });

    it('存在しない投稿・不正な ID は 404。不正なトークンは 401', async () => {
      const fan = await registerUser('fan');
      await comment(2147483647, 'こんにちは', fan).expect(404);
      await listComments(2147483647).expect(404);
      await request(app.getHttpServer())
        .get('/api/spots/abc/comments')
        .expect(404);
      await request(app.getHttpServer())
        .get('/api/spots/1/comments')
        .set('Authorization', 'Bearer invalid.token.value')
        .expect(401);
    });
  });

  describe('コメント: 一覧のページング', () => {
    it('古い順にカーソルでページ送りでき、重複も抜けもない', async () => {
      const owner = await registerUser('owner');
      const fan = await registerUser('fan');
      const id = await createSpot(owner);
      const created: number[] = [];
      for (let i = 1; i <= 5; i++) {
        created.push(
          (await comment(id, `コメント ${i}`, fan).expect(201)).body.id,
        );
      }

      const page1 = (await listComments(id, '?limit=2').expect(200)).body;
      expect(page1.items.map((c: { id: number }) => c.id)).toEqual(
        created.slice(0, 2),
      );
      expect(page1.nextCursor).toBe(created[1]);
      const page2 = (
        await listComments(id, `?limit=2&cursor=${page1.nextCursor}`).expect(
          200,
        )
      ).body;
      expect(page2.items.map((c: { id: number }) => c.id)).toEqual(
        created.slice(2, 4),
      );
      const page3 = (
        await listComments(id, `?limit=2&cursor=${page2.nextCursor}`).expect(
          200,
        )
      ).body;
      expect(page3.items.map((c: { id: number }) => c.id)).toEqual([
        created[4],
      ]);
      expect(page3.nextCursor).toBeNull();
    });

    it('ちょうど件数分のときは nextCursor が null。limit 省略時は 20 件まで', async () => {
      const owner = await registerUser('owner');
      const fan = await registerUser('fan');
      const id = await createSpot(owner);
      for (let i = 0; i < 3; i++) await comment(id, `c${i}`, fan).expect(201);
      expect(
        (await listComments(id, '?limit=3').expect(200)).body.nextCursor,
      ).toBeNull();

      for (let i = 0; i < 19; i++) await comment(id, `d${i}`, fan).expect(201);
      const first = (await listComments(id).expect(200)).body;
      expect(first.items).toHaveLength(20);
      expect(first.nextCursor).not.toBeNull();
    });

    it.each([
      ['limit が 0', '?limit=0'],
      ['limit が上限超え', '?limit=51'],
      ['cursor が数字でない', '?cursor=abc'],
      ['想定外のクエリ', '?foo=1'],
    ])('クエリが不正なら 400: %s', async (_label, query) => {
      const owner = await registerUser('owner');
      const id = await createSpot(owner);
      await listComments(id, query).expect(400);
    });
  });

  describe('コメント: 削除 DELETE /api/spots/:id/comments/:commentId', () => {
    it('コメントした本人は削除できる', async () => {
      const owner = await registerUser('owner');
      const fan = await registerUser('fan');
      const id = await createSpot(owner);
      const c = (await comment(id, 'こんにちは', fan).expect(201)).body.id;
      await deleteComment(id, c, fan).expect(204);
      expect(await prisma.comment.count({ where: { id: c } })).toBe(0);
      expect((await getSpot(id).expect(200)).body.commentCount).toBe(0);
    });

    it('投稿者は、自分の投稿の他人のコメントを削除できる', async () => {
      const owner = await registerUser('owner');
      const fan = await registerUser('fan');
      const id = await createSpot(owner);
      const c = (await comment(id, '不適切なコメント', fan).expect(201)).body
        .id;
      await deleteComment(id, c, owner).expect(204);
      expect(await prisma.comment.count({ where: { id: c } })).toBe(0);
    });

    it('関係のない第三者は削除できない(403)。コメントは残る', async () => {
      const owner = await registerUser('owner');
      const fan = await registerUser('fan');
      const third = await registerUser('third');
      const id = await createSpot(owner);
      const c = (await comment(id, 'こんにちは', fan).expect(201)).body.id;
      const res = await deleteComment(id, c, third).expect(403);
      expect(res.body.code).toBe('FORBIDDEN');
      expect(await prisma.comment.count({ where: { id: c } })).toBe(1);
    });

    it('コメントした人であっても、他人の投稿の別の人のコメントは削除できない', async () => {
      const owner = await registerUser('owner');
      const a = await registerUser('a');
      const b = await registerUser('b');
      const id = await createSpot(owner);
      const ca = (await comment(id, 'A のコメント', a).expect(201)).body.id;
      await comment(id, 'B のコメント', b).expect(201);
      await deleteComment(id, ca, b).expect(403);
    });

    it('ログインしていなければ 401', async () => {
      const owner = await registerUser('owner');
      const fan = await registerUser('fan');
      const id = await createSpot(owner);
      const c = (await comment(id, 'こんにちは', fan).expect(201)).body.id;
      await deleteComment(id, c).expect(401);
    });

    it('存在しないコメント・不正な ID は 404。別の投稿のコメント ID を指定しても 404', async () => {
      const owner = await registerUser('owner');
      const fan = await registerUser('fan');
      const id = await createSpot(owner);
      const other = await createSpot(owner);
      const c = (await comment(other, 'こんにちは', fan).expect(201)).body.id;

      await deleteComment(id, 2147483647, owner).expect(404);
      for (const bad of ['abc', '0', '-1'])
        await deleteComment(id, bad, owner).expect(404);
      // 別の投稿のコメントは、その投稿の URL では削除できない(投稿者でも)
      await deleteComment(id, c, owner).expect(404);
      expect(await prisma.comment.count({ where: { id: c } })).toBe(1);
    });

    it('閲覧できない投稿のコメントは削除できない(404)', async () => {
      const owner = await registerUser('owner');
      const stranger = await registerUser('stranger');
      const id = await createSpot(owner, 'private');
      const c = (await comment(id, 'メモ', owner).expect(201)).body.id;
      await deleteComment(id, c, stranger).expect(404);
      expect(await prisma.comment.count({ where: { id: c } })).toBe(1);
    });

    it('投稿を削除すると、コメントも消える。ユーザーを削除すると、そのユーザーのコメントといいねも消える', async () => {
      const owner = await registerUser('owner');
      const fan = await registerUser('fan');
      const id = await createSpot(owner);
      await comment(id, 'こんにちは', fan).expect(201);
      await like(id, fan).expect(200);

      await prisma.user.delete({ where: { id: fan.id } });
      expect(await prisma.comment.count({ where: { spotId: id } })).toBe(0);
      expect(await prisma.like.count({ where: { spotId: id } })).toBe(0);
      expect((await getSpot(id).expect(200)).body).toMatchObject({
        likeCount: 0,
        commentCount: 0,
      });

      const id2 = await createSpot(owner);
      const other = await registerUser('other');
      await comment(id2, 'こんにちは', other).expect(201);
      await request(app.getHttpServer())
        .delete(`/api/spots/${id2}`)
        .set('Authorization', bearer(owner))
        .expect(204);
      expect(await prisma.comment.count({ where: { spotId: id2 } })).toBe(0);
    });
  });
});

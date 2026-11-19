import 'dotenv/config';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { retryOnWriteConflict } from './../src/prisma/retry.js';

// ローカル・CI では、S3 互換のサーバー(docker compose up -d s3 の S3Mock)に対して動かす。
// 署名付き URL でのアップロード・取得は、実際に HTTP で行う。
// 指定がなければ、開発用の既定値を使う(AWS には接続しない)
process.env['S3_ENDPOINT'] ??= 'http://localhost:9090';
process.env['S3_BUCKET'] ??= 'tripdiary-e2e';
process.env['S3_REGION'] ??= 'ap-northeast-1';
process.env['AWS_ACCESS_KEY_ID'] ??= 'local';
process.env['AWS_SECRET_ACCESS_KEY'] ??= 'local';

// 写真の結合テスト。
// 起動中の MySQL(docker compose up -d db)と S3 互換のサーバー(同 s3)、DATABASE_URL、JWT_SECRET が必要
describe('Photos (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const PREFIX = 'e2e-photos-';

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
    visibility: 'public' | 'followers' | 'private' = 'public',
  ): Promise<number> => {
    const res = await request(app.getHttpServer())
      .post('/api/spots')
      .set('Authorization', bearer(owner))
      .send({ name: '投稿', areas: ['京都府'], visibility })
      .expect(201);
    return res.body.id as number;
  };

  const startUpload = (spotId: number | string, body: unknown, u?: TestUser) =>
    as(u)(
      request(app.getHttpServer())
        .post(`/api/spots/${spotId}/photos`)
        .send(body as object),
    );
  const complete = (
    spotId: number | string,
    photoId: number | string,
    u?: TestUser,
  ) =>
    as(u)(
      request(app.getHttpServer()).post(
        `/api/spots/${spotId}/photos/${photoId}/complete`,
      ),
    );
  const removePhoto = (
    spotId: number | string,
    photoId: number | string,
    u?: TestUser,
  ) =>
    as(u)(
      request(app.getHttpServer()).delete(
        `/api/spots/${spotId}/photos/${photoId}`,
      ),
    );
  const getSpot = (id: number, u?: TestUser) =>
    as(u)(request(app.getHttpServer()).get(`/api/spots/${id}`));
  const listSpots = (query: string, u?: TestUser) =>
    as(u)(request(app.getHttpServer()).get(`/api/spots${query}`));

  // 1 枚アップロードして、完了まで進める(ブラウザと同じ手順)。画像の中身は、見分けのつく短いバイト列
  const uploadPhoto = async (
    spotId: number,
    owner: TestUser,
    content: string,
    contentType = 'image/png',
  ): Promise<{ id: number; url: string }> => {
    const bytes = Buffer.from(content);
    const started = (
      await startUpload(
        spotId,
        { contentType, size: bytes.length },
        owner,
      ).expect(201)
    ).body as {
      photoId: number;
      uploadUrl: string;
      headers: Record<string, string>;
    };
    const put = await fetch(started.uploadUrl, {
      method: 'PUT',
      headers: started.headers,
      body: bytes,
    });
    expect(put.status).toBe(200);
    const done = await complete(spotId, started.photoId, owner).expect(200);
    return done.body as { id: number; url: string };
  };

  const fetchText = async (url: string) => {
    const res = await fetch(url);
    return { status: res.status, text: await res.text() };
  };

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

  describe('アップロードの流れ', () => {
    it('署名付き URL へ PUT し、完了すると、詳細と一覧に写真が出て、URL から取得できる', async () => {
      const owner = await registerUser('owner');
      const id = await createSpot(owner);

      // 写真がない間は、空・null
      expect((await getSpot(id).expect(200)).body.photos).toEqual([]);

      const photo = await uploadPhoto(id, owner, 'first-image-bytes');
      expect(photo.url).toContain('X-Amz-Signature');

      const detail = (await getSpot(id).expect(200)).body;
      expect(detail.photos).toHaveLength(1);
      expect(detail.photos[0].id).toBe(photo.id);
      // 表示用の URL から、置いた画像が、そのまま取れる(未ログインでも、公開の投稿なら、URL を持っていれば取れる)
      expect(await fetchText(detail.photos[0].url)).toEqual({
        status: 200,
        text: 'first-image-bytes',
      });

      // 一覧の代表の写真は、先頭の 1 枚
      const list = (await listSpots(`?author=${owner.id}`).expect(200)).body;
      const item = list.items.find((s: { id: number }) => s.id === id);
      expect((await fetchText(item.coverPhotoUrl)).text).toBe(
        'first-image-bytes',
      );
    });

    it('複数枚は、アップロードした順に並び、先頭を消すと、次の写真が代表になる', async () => {
      const owner = await registerUser('order');
      const id = await createSpot(owner);
      const a = await uploadPhoto(id, owner, 'image-a');
      const b = await uploadPhoto(id, owner, 'image-b', 'image/jpeg');
      const c = await uploadPhoto(id, owner, 'image-c', 'image/webp');

      const before = (await getSpot(id).expect(200)).body.photos;
      expect(before.map((p: { id: number }) => p.id)).toEqual([
        a.id,
        b.id,
        c.id,
      ]);

      await removePhoto(id, a.id, owner).expect(204);
      const after = (await getSpot(id).expect(200)).body.photos;
      expect(after.map((p: { id: number }) => p.id)).toEqual([b.id, c.id]);
      const list = (await listSpots(`?author=${owner.id}`).expect(200)).body;
      const item = list.items.find((s: { id: number }) => s.id === id);
      expect((await fetchText(item.coverPhotoUrl)).text).toBe('image-b');
    });

    it('写真を消すと、画像も消える(URL から取れなくなる)', async () => {
      const owner = await registerUser('delete');
      const id = await createSpot(owner);
      const photo = await uploadPhoto(id, owner, 'to-be-deleted');
      expect((await fetchText(photo.url)).status).toBe(200);

      await removePhoto(id, photo.id, owner).expect(204);
      expect((await fetchText(photo.url)).status).toBe(404);
      // もう一度消そうとすると 404
      await removePhoto(id, photo.id, owner).expect(404);
    });

    it('投稿を消すと、写真の画像も消える', async () => {
      const owner = await registerUser('cascade');
      const id = await createSpot(owner);
      const photo = await uploadPhoto(id, owner, 'cascade-image');
      expect((await fetchText(photo.url)).status).toBe(200);

      await request(app.getHttpServer())
        .delete(`/api/spots/${id}`)
        .set('Authorization', bearer(owner))
        .expect(204);
      expect((await fetchText(photo.url)).status).toBe(404);
      expect(await prisma.photo.count({ where: { spotId: id } })).toBe(0);
    });

    it('完了を呼ぶまでは表示されない。アップロードされていなければ、完了は 400', async () => {
      const owner = await registerUser('pending');
      const id = await createSpot(owner);
      const started = (
        await startUpload(
          id,
          { contentType: 'image/png', size: 10 },
          owner,
        ).expect(201)
      ).body;

      expect((await getSpot(id).expect(200)).body.photos).toEqual([]);
      const res = await complete(id, started.photoId, owner).expect(400);
      expect(res.body.code).toBe('UPLOAD_NOT_FOUND');
      expect((await getSpot(id).expect(200)).body.photos).toEqual([]);
    });

    it('完了は、同じ写真に何度呼んでも、同じ結果になる', async () => {
      const owner = await registerUser('idempotent');
      const id = await createSpot(owner);
      const photo = await uploadPhoto(id, owner, 'once');
      const again = await complete(id, photo.id, owner).expect(200);
      expect(again.body.id).toBe(photo.id);
      expect((await getSpot(id).expect(200)).body.photos).toHaveLength(1);
    });
  });

  describe('置かれた画像の確認(申告ではなく、実際の値で判断する)', () => {
    it('申告と違う形式の画像は、完了で 400 になり、行も画像も消える', async () => {
      const owner = await registerUser('wrongtype');
      const id = await createSpot(owner);
      const started = (
        await startUpload(
          id,
          { contentType: 'image/png', size: 5 },
          owner,
        ).expect(201)
      ).body;
      // 申告は PNG だが、別の形式(GIF)として置く
      await fetch(started.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/gif' },
        body: Buffer.from('GIF89'),
      });

      const res = await complete(id, started.photoId, owner).expect(400);
      expect(res.body.code).toBe('INVALID_UPLOAD');
      expect(await prisma.photo.count({ where: { spotId: id } })).toBe(0);
      expect((await fetchText(started.uploadUrl)).status).not.toBe(200);
    });

    it('5MB を超える画像は、完了で 400 になる', async () => {
      const owner = await registerUser('toolarge');
      const id = await createSpot(owner);
      const started = (
        await startUpload(
          id,
          { contentType: 'image/png', size: 100 },
          owner,
        ).expect(201)
      ).body;
      // 申告は 100 バイトだが、実際は 5MB + 1 バイト
      await fetch(started.uploadUrl, {
        method: 'PUT',
        headers: started.headers,
        body: Buffer.alloc(5 * 1024 * 1024 + 1),
      });

      const res = await complete(id, started.photoId, owner).expect(400);
      expect(res.body.code).toBe('INVALID_UPLOAD');
      expect(await prisma.photo.count({ where: { spotId: id } })).toBe(0);
    });
  });

  describe('入力の検証', () => {
    it('形式・大きさが不正なら 400(フィールドごとのエラー)', async () => {
      const owner = await registerUser('validation');
      const id = await createSpot(owner);
      const bad = [
        { contentType: 'image/gif', size: 100 },
        { contentType: 'application/pdf', size: 100 },
        { contentType: 'image/png', size: 0 },
        { contentType: 'image/png', size: -1 },
        { contentType: 'image/png', size: 5 * 1024 * 1024 + 1 },
        { contentType: 'image/png', size: 1.5 },
        { contentType: 'image/png', size: '100' },
        { contentType: 'image/png' },
        {},
      ];
      for (const body of bad) {
        const res = await startUpload(id, body, owner).expect(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
      }
      // ちょうど 5MB は、受け付ける
      await startUpload(
        id,
        { contentType: 'image/webp', size: 5 * 1024 * 1024 },
        owner,
      ).expect(201);
    });

    it('1 投稿に付けられるのは、最大 20 枚', async () => {
      const owner = await registerUser('limit');
      const id = await createSpot(owner);
      for (let i = 0; i < 20; i++) {
        await startUpload(
          id,
          { contentType: 'image/jpeg', size: 10 },
          owner,
        ).expect(201);
      }
      const res = await startUpload(
        id,
        { contentType: 'image/jpeg', size: 10 },
        owner,
      ).expect(400);
      expect(res.body.code).toBe('PHOTO_LIMIT_EXCEEDED');
      expect(await prisma.photo.count({ where: { spotId: id } })).toBe(20);
    });

    it('期限を過ぎた pending は、上限に数えず、次の発行のときに片付ける', async () => {
      const owner = await registerUser('stale');
      const id = await createSpot(owner);
      for (let i = 0; i < 20; i++) {
        await startUpload(
          id,
          { contentType: 'image/jpeg', size: 10 },
          owner,
        ).expect(201);
      }
      // 20 件すべてを、2 時間前に発行されたことにする
      await prisma.photo.updateMany({
        where: { spotId: id },
        data: { createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
      });
      await startUpload(
        id,
        { contentType: 'image/jpeg', size: 10 },
        owner,
      ).expect(201);
      expect(await prisma.photo.count({ where: { spotId: id } })).toBe(1);
    });

    it('投稿・写真の ID が不正なら 404', async () => {
      const owner = await registerUser('badid');
      const id = await createSpot(owner);
      await startUpload(
        'abc',
        { contentType: 'image/png', size: 1 },
        owner,
      ).expect(404);
      await complete(id, 'abc', owner).expect(404);
      await removePhoto(id, '99999999999', owner).expect(404);
      await complete(id, 999999, owner).expect(404);
    });
  });

  describe('権限', () => {
    it('ログインが必要(未ログインは 401)', async () => {
      const owner = await registerUser('auth');
      const id = await createSpot(owner);
      const photo = await uploadPhoto(id, owner, 'x');
      await startUpload(id, { contentType: 'image/png', size: 1 }).expect(401);
      await complete(id, photo.id).expect(401);
      await removePhoto(id, photo.id).expect(401);
    });

    it('本人以外は、公開の投稿でも、写真を付けられない・外せない(403)', async () => {
      const owner = await registerUser('owner2');
      const other = await registerUser('other');
      const id = await createSpot(owner, 'public');
      const photo = await uploadPhoto(id, owner, 'mine');

      await startUpload(
        id,
        { contentType: 'image/png', size: 1 },
        other,
      ).expect(403);
      await complete(id, photo.id, other).expect(403);
      await removePhoto(id, photo.id, other).expect(403);
      // 写真は、そのまま残っている
      expect((await getSpot(id).expect(200)).body.photos).toHaveLength(1);
    });

    it('閲覧できない投稿(非公開・フォロワー限定)には、存在を知らせず 404', async () => {
      const owner = await registerUser('owner3');
      const other = await registerUser('stranger');
      const privateId = await createSpot(owner, 'private');
      const followersId = await createSpot(owner, 'followers');
      const photo = await uploadPhoto(privateId, owner, 'secret');

      for (const id of [privateId, followersId]) {
        await startUpload(
          id,
          { contentType: 'image/png', size: 1 },
          other,
        ).expect(404);
      }
      await complete(privateId, photo.id, other).expect(404);
      await removePhoto(privateId, photo.id, other).expect(404);
    });

    it('非公開の投稿の写真は、本人以外には、投稿ごと見えない(URL も出ない)', async () => {
      const owner = await registerUser('owner4');
      const other = await registerUser('viewer');
      const id = await createSpot(owner, 'private');
      await uploadPhoto(id, owner, 'private-image');

      await getSpot(id).expect(404);
      await getSpot(id, other).expect(404);
      const list = (await listSpots(`?author=${owner.id}`, other).expect(200))
        .body;
      expect(list.items.some((s: { id: number }) => s.id === id)).toBe(false);
      // 本人には見える
      expect((await getSpot(id, owner).expect(200)).body.photos).toHaveLength(
        1,
      );
    });

    it('フォロワー限定の投稿の写真は、フォロワーにだけ見える', async () => {
      const owner = await registerUser('owner5');
      const follower = await registerUser('follower');
      const stranger = await registerUser('stranger2');
      const id = await createSpot(owner, 'followers');
      await uploadPhoto(id, owner, 'followers-image');
      await request(app.getHttpServer())
        .post(`/api/users/${owner.id}/follow`)
        .set('Authorization', bearer(follower))
        .expect(200);

      expect(
        (await getSpot(id, follower).expect(200)).body.photos,
      ).toHaveLength(1);
      await getSpot(id, stranger).expect(404);
      await getSpot(id).expect(404);
    });

    it('別の投稿の写真の ID では、操作できない(404)', async () => {
      const owner = await registerUser('cross');
      const a = await createSpot(owner);
      const b = await createSpot(owner);
      const photo = await uploadPhoto(a, owner, 'in-a');

      await complete(b, photo.id, owner).expect(404);
      await removePhoto(b, photo.id, owner).expect(404);
      expect((await getSpot(a).expect(200)).body.photos).toHaveLength(1);
    });
  });

  describe('マイリスト', () => {
    it('マイリストの一覧にも、代表の写真が付く', async () => {
      const owner = await registerUser('listowner');
      const viewer = await registerUser('listviewer');
      const id = await createSpot(owner);
      await uploadPhoto(id, owner, 'list-cover');
      await request(app.getHttpServer())
        .put(`/api/spots/${id}/list`)
        .set('Authorization', bearer(viewer))
        .send({ status: 'wishlist' })
        .expect(200);

      const list = (
        await request(app.getHttpServer())
          .get('/api/me/list?status=wishlist')
          .set('Authorization', bearer(viewer))
          .expect(200)
      ).body;
      expect(list.items).toHaveLength(1);
      expect((await fetchText(list.items[0].coverPhotoUrl)).text).toBe(
        'list-cover',
      );
    });
  });
});

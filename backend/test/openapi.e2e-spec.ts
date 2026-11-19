import 'dotenv/config';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import SwaggerParser from '@apidevtools/swagger-parser';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import {
  createOpenApiDocument,
  setupSwaggerUi,
} from './../src/openapi/openapi.js';

// API 仕様書(OpenAPI)の内容を検証する。
// docs/api/openapi.json との一致は、ビルド後に `npm run openapi:check` で確認する(CI で実行)。
// ここでは、「仕様書が正しい OpenAPI か」「実際の API を漏れなく説明しているか」「公開されているか」を確認する。
describe('OpenAPI (e2e)', () => {
  let app: INestApplication<App>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let doc: any;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    setupSwaggerUi(app);
    await app.init();
    doc = createOpenApiDocument(app);
  });

  afterAll(async () => {
    await app.close();
  });

  const operations = () =>
    Object.entries(
      doc.paths as Record<string, Record<string, unknown>>,
    ).flatMap(([path, methods]) =>
      Object.entries(methods).map(([method, op]) => ({
        path,
        method,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        op: op as any,
      })),
    );

  it('正しい OpenAPI 3 の仕様書である(参照が解決でき、構造が有効)', async () => {
    // validate は、スキーマの検証と、$ref の解決を行う(壊れていれば例外)
    await expect(
      SwaggerParser.validate(JSON.parse(JSON.stringify(doc))),
    ).resolves.toBeDefined();
    expect(doc.openapi).toMatch(/^3\./);
    expect(doc.info.title).toBe('TripDiary API');
  });

  it('実際の API をすべて説明している(漏れがない)', () => {
    const documented = operations()
      .map((o) => `${o.method.toUpperCase()} ${o.path}`)
      .sort();
    expect(documented).toEqual(
      [
        'GET /api/health',
        'GET /api/health/live',
        'POST /api/auth/register',
        'POST /api/auth/login',
        'POST /api/auth/refresh',
        'POST /api/auth/logout',
        'GET /api/auth/me',
        'POST /api/spots',
        'GET /api/spots',
        'GET /api/spots/{id}',
        'PUT /api/spots/{id}',
        'DELETE /api/spots/{id}',
        'GET /api/users/{id}',
        'POST /api/users/{id}/follow',
        'DELETE /api/users/{id}/follow',
        'POST /api/spots/{id}/like',
        'DELETE /api/spots/{id}/like',
        'GET /api/spots/{spotId}/comments',
        'POST /api/spots/{spotId}/comments',
        'DELETE /api/spots/{spotId}/comments/{commentId}',
        'PUT /api/spots/{id}/list',
        'DELETE /api/spots/{id}/list',
        'GET /api/me/list',
        'POST /api/spots/{spotId}/photos',
        'POST /api/spots/{spotId}/photos/{photoId}/complete',
        'DELETE /api/spots/{spotId}/photos/{photoId}',
      ].sort(),
    );
  });

  it('すべての操作に、タグ・概要・成功時の応答の説明がある', () => {
    for (const { path, method, op } of operations()) {
      const where = `${method.toUpperCase()} ${path}`;
      expect(op.tags?.length, `${where}: tags`).toBeGreaterThan(0);
      expect(op.summary, `${where}: summary`).toBeTruthy();
      const success = Object.keys(op.responses).filter((s) =>
        s.startsWith('2'),
      );
      expect(success.length, `${where}: 成功時の応答`).toBeGreaterThan(0);
    }
  });

  it('ログインが必要な API には認証が、ログイン任意の API には「なしでも可」が書かれている', () => {
    const security = (m: string, p: string) => doc.paths[p][m].security;
    // 必須(トークンがなければ 401)
    for (const [m, p] of [
      ['post', '/api/spots'],
      ['put', '/api/spots/{id}'],
      ['delete', '/api/spots/{id}'],
      ['get', '/api/auth/me'],
      ['post', '/api/users/{id}/follow'],
      ['post', '/api/spots/{id}/like'],
      ['post', '/api/spots/{spotId}/comments'],
      ['delete', '/api/spots/{spotId}/comments/{commentId}'],
      ['put', '/api/spots/{id}/list'],
      ['delete', '/api/spots/{id}/list'],
      ['get', '/api/me/list'],
      ['post', '/api/spots/{spotId}/photos'],
      ['post', '/api/spots/{spotId}/photos/{photoId}/complete'],
      ['delete', '/api/spots/{spotId}/photos/{photoId}'],
    ] as const) {
      expect(security(m, p), `${m} ${p}`).toEqual([{ bearer: [] }]);
    }
    // 任意(トークンなしでも呼べる: security に空の要件 {} を含む)
    for (const [m, p] of [
      ['get', '/api/spots'],
      ['get', '/api/spots/{id}'],
      ['get', '/api/users/{id}'],
      ['get', '/api/spots/{spotId}/comments'],
    ] as const) {
      expect(security(m, p), `${m} ${p}`).toEqual([{ bearer: [] }, {}]);
    }
    // ログイン・登録・ヘルスチェックは、認証なし
    for (const [m, p] of [
      ['post', '/api/auth/login'],
      ['post', '/api/auth/register'],
      ['get', '/api/health'],
    ] as const) {
      expect(security(m, p), `${m} ${p}`).toBeUndefined();
    }
    // リフレッシュ・ログアウトは、Cookie のリフレッシュトークン
    expect(security('post', '/api/auth/refresh')).toEqual([
      { refresh_token: [] },
    ]);
  });

  it('エラー応答は、すべて共通の形(ApiErrorResponse)で説明されている', () => {
    for (const { path, method, op } of operations()) {
      for (const [status, res] of Object.entries(op.responses)) {
        if (!/^[45]/.test(status)) continue;
        expect(
          (res as { content?: Record<string, { schema?: { $ref?: string } }> })
            .content?.['application/json']?.schema?.$ref,
          `${method.toUpperCase()} ${path} ${status}`,
        ).toBe('#/components/schemas/ApiErrorResponse');
      }
    }
    expect(doc.components.schemas.ApiErrorResponse.required).toEqual([
      'code',
      'message',
    ]);
  });

  it('入力の制約が、実際の検証と同じ値で書かれている(投稿・コメント・ページング)', () => {
    const spot = doc.components.schemas.SpotInputDto;
    expect(spot.required).toEqual(['name', 'areas', 'visibility']);
    expect(spot.properties.name).toMatchObject({
      minLength: 1,
      maxLength: 100,
    });
    expect(spot.properties.areas).toMatchObject({ minItems: 1, maxItems: 3 });
    expect(spot.properties.visibility.enum).toEqual([
      'public',
      'followers',
      'private',
    ]);
    expect(spot.properties.latitude).toMatchObject({
      minimum: -90,
      maximum: 90,
    });
    expect(spot.properties.longitude).toMatchObject({
      minimum: -180,
      maximum: 180,
    });
    expect(
      doc.components.schemas.CreateCommentDto.properties.body,
    ).toMatchObject({
      minLength: 1,
      maxLength: 500,
    });
    const params = doc.paths['/api/spots'].get.parameters as {
      name: string;
      schema: { minimum?: number; maximum?: number; default?: number };
    }[];
    const limit = params.find((p) => p.name === 'limit')!;
    expect(limit.schema).toMatchObject({
      minimum: 1,
      maximum: 50,
      default: 20,
    });
    expect(params.map((p) => p.name).sort()).toEqual(
      ['area', 'author', 'cursor', 'following', 'limit'].sort(),
    );
  });

  it('応答に、パスワード・ハッシュ・トークンのハッシュなどの内部の項目が含まれない', () => {
    const text = JSON.stringify(doc.components.schemas);
    expect(text).not.toMatch(/passwordHash|password_hash|tokenHash|token_hash/);
    // メールアドレスを返すのは、本人の情報(AuthUser)だけ。他人にも見えるスキーマには含めない
    for (const name of [
      'UserSummary',
      'UserProfile',
      'SpotResponse',
      'SpotListItem',
      'CommentResponse',
    ]) {
      expect(
        Object.keys(doc.components.schemas[name].properties),
        name,
      ).not.toContain('email');
    }
    expect(Object.keys(doc.components.schemas.AuthUser.properties)).toContain(
      'email',
    );
  });

  it('Swagger UI(/api/docs)と、仕様書の JSON(/api/docs-json)が公開されている', async () => {
    const ui = await request(app.getHttpServer()).get('/api/docs').expect(200);
    expect(ui.text).toContain('swagger');
    const json = await request(app.getHttpServer())
      .get('/api/docs-json')
      .expect(200);
    expect(json.body.info.title).toBe('TripDiary API');
    expect(Object.keys(json.body.paths).length).toBe(
      Object.keys(doc.paths).length,
    );
  });
});

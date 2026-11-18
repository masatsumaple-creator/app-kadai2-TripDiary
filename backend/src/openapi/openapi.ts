import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

// API 仕様書(OpenAPI)の作成。アプリの起動時(Swagger UI の公開)と、
// 仕様書ファイル(docs/api/openapi.json)の生成・差分チェックで共通に使う。

export const API_VERSION = '0.1.0';

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('TripDiary API')
    .setVersion(API_VERSION)
    .setDescription(
      [
        '旅行の記録を、写真・感想・住所つきで残し、地図と一緒に共有するアプリの API。',
        '',
        '## 認証',
        '- ログイン(`POST /api/auth/login`)で、アクセストークン(JWT、有効期限 15 分)を本文で、リフレッシュトークンを HttpOnly の Cookie(`refresh_token`)で受け取る。',
        '- アクセストークンは `Authorization: Bearer <token>` で送る。期限が切れたら `POST /api/auth/refresh` で再発行する。',
        '- 「ログインは任意」の API は、トークンがなければ未ログインとして扱う。トークンを付けたのに不正・期限切れなら 401。',
        '',
        '## エラー応答',
        '- どのエラーも `{ code, message, fieldErrors? }` の形。入力エラーのときは、`fieldErrors` に項目名ごとのメッセージが入る。',
        '- 閲覧できない投稿・ユーザーは、存在しない場合と同じ 404 を返す(存在を知らせない)。',
        '',
        '## ページング',
        '- 一覧は、カーソル方式。応答の `nextCursor` を、次のリクエストの `cursor` に渡す(`null` なら最後のページ)。',
        '',
        '> この仕様書は、コードから自動生成している(`npm run openapi`)。仕様書(docs/ の文書)と食い違う場合は、docs/ の文書を正とする。',
      ].join('\n'),
    )
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'bearer',
    )
    .addCookieAuth('refresh_token', undefined, 'refresh_token')
    .build();

  return SwaggerModule.createDocument(app, config);
}

// 仕様書をファイルに保存する形(差分が見やすいよう、整形して、末尾に改行)
export function serializeDocument(document: OpenAPIObject): string {
  return JSON.stringify(document, null, 2) + '\n';
}

// Swagger UI(/api/docs)と、仕様書の JSON(/api/docs-json)を公開する
export function setupSwaggerUi(app: INestApplication): void {
  SwaggerModule.setup('api/docs', app, createOpenApiDocument(app), {
    jsonDocumentUrl: 'api/docs-json',
  });
}

// Swagger UI を公開するか。SWAGGER_ENABLED があれば、それに従う('true' のときだけ公開)。
// なければ、本番(NODE_ENV=production)以外で公開する
export function isSwaggerEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const flag = env['SWAGGER_ENABLED'];
  if (flag !== undefined && flag !== '') {
    return flag === 'true';
  }
  return env['NODE_ENV'] !== 'production';
}

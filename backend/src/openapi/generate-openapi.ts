import 'reflect-metadata';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { configureApp } from '../app.setup.js';
import { createOpenApiDocument, serializeDocument } from './openapi.js';

// 仕様書ファイル(docs/api/openapi.json)の生成と、差分チェック。
//   npm run openapi          … 生成して、ファイルを更新する
//   npm run openapi:check    … 生成した内容が、コミット済みのファイルと一致するか確認する(CI で実行)
// ビルド後の dist/ から実行する(`npm run build` が先に必要)。DB には接続しない。

// 仕様書を作るだけなので、本物の接続先や鍵は不要。環境の値が仕様書に混ざらないよう、固定のダミーにする
process.env['DATABASE_URL'] = 'mysql://openapi:openapi@127.0.0.1:3306/openapi';
process.env['JWT_SECRET'] = 'openapi-generation-only';

const OUTPUT = path.resolve(
  import.meta.dirname,
  '../../../docs/api/openapi.json',
);

// 改行コード(Windows の CRLF)の違いで、差分があると誤判定しないよう、LF にそろえて比較する
const normalize = (text: string) => text.replace(/\r\n/g, '\n');

async function main(): Promise<void> {
  const check = process.argv.includes('--check');

  const app = await NestFactory.create(AppModule, { logger: false });
  configureApp(app);
  const generated = serializeDocument(createOpenApiDocument(app));
  await app.close();

  if (check) {
    let committed = '';
    try {
      committed = readFileSync(OUTPUT, 'utf8');
    } catch {
      console.error(
        `仕様書がありません: ${OUTPUT}\nnpm run openapi で生成してください。`,
      );
      process.exit(1);
    }
    if (normalize(committed) !== normalize(generated)) {
      console.error(
        [
          'API 仕様書(docs/api/openapi.json)が、コードから生成した内容と一致しません。',
          'API(コントローラー・DTO・応答の型・OpenAPI の記述)を変更した場合は、',
          '`npm run openapi` を実行して、更新された docs/api/openapi.json を一緒にコミットしてください。',
        ].join('\n'),
      );
      process.exit(1);
    }
    console.log(
      'API 仕様書(docs/api/openapi.json)は、コードと一致しています。',
    );
    return;
  }

  mkdirSync(path.dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, generated);
  console.log(
    `API 仕様書を生成しました: ${path.relative(process.cwd(), OUTPUT)}`,
  );
}

await main();

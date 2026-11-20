# backend(NestJS API)

TripDiary の REST API です。NestJS 12(ESM)+ Prisma 7 + MySQL 8.4。全体の説明とローカルでの起動手順は、[ルートの README](../README.md) を参照してください。

## 起動

```bash
cp ../.env.example .env        # DATABASE_URL と JWT_SECRET を設定する
npm install
npx prisma migrate deploy      # テーブルを作る(DB は ../docker-compose.yml)
npm run start:dev              # http://localhost:3000(API は /api、仕様書は /api/docs)
```

## 環境変数

| 名前 | 内容 |
|---|---|
| `DATABASE_URL` | MySQL への接続先(例: `mysql://tripdiary:tripdiary@localhost:3306/tripdiary`) |
| `DB_HOST` `DB_PORT` `DB_NAME` `DB_USER` `DB_PASSWORD` | `DATABASE_URL` の代わりに、部品で渡す(AWS の ECS 用。`DATABASE_URL` があればそちらが優先。パスワードは自動で URL エンコードする)。`DB_PORT` の既定は 3306 |
| `JWT_SECRET` | アクセストークンの署名鍵(長いランダム文字列) |
| `S3_BUCKET` `S3_REGION` `S3_ENDPOINT` | 写真の置き場。`S3_BUCKET` は必須(なければ、写真のアップロードだけが 503 になる)。`S3_ENDPOINT` は、ローカルの S3 互換サーバー用(`docker compose up -d s3`。AWS では付けない)。認証は、AWS の標準(ECS ではタスクロール。ローカルは `AWS_ACCESS_KEY_ID`・`AWS_SECRET_ACCESS_KEY`) |
| `LOCATION_REGION` | 住所の取得(Amazon Location Service)のリージョン(既定は ap-northeast-1)。認証は、AWS の標準(ECS ではタスクロール。ローカルで試すときは、AWS の認証情報が要る。テストは AWS に接続しない) |
| `SWAGGER_ENABLED` | Swagger UI(`/api/docs`)を公開するか。`true` / `false`。未設定のときは、本番(`NODE_ENV=production`)以外で公開 |
| `PORT` | 待ち受けポート(既定 3000) |
| `NODE_ENV` | `production` のとき、リフレッシュトークンの Cookie に `Secure` を付ける |

## コンテナイメージ(本番用)

```bash
docker build -t tripdiary-backend .      # backend/ で実行。本番は ARM64(Graviton)
```

Node 24、非 root、本番の依存と Prisma CLI だけを含む。起動は `node dist/main.js`、マイグレーションは同じイメージで `npx prisma migrate deploy` を実行する(`DB_*` の環境変数だけで動く)。SIGTERM を受けると、処理中のリクエストを終えてから止まる。ヘルスチェックは `GET /api/health/live`(DB に依存しない)。

## コマンド

| コマンド | 内容 |
|---|---|
| `npm run start:dev` | 変更を監視して起動 |
| `npm run build` | ビルド(`dist/`) |
| `npm run lint` | oxlint(型情報つき) |
| `npm test` | 単体テスト(Vitest) |
| `npm run test:e2e` | 結合テスト(実際の MySQL に対する API テスト。DB が必要) |
| `npm run openapi` | `../docs/api/openapi.json` を再生成する(コードの変更後に実行してコミット) |
| `npx prisma migrate dev --name <名前>` | スキーマを変えたときにマイグレーションを作る |

## 構成(`src/`)

| ディレクトリ | 役割 |
|---|---|
| `auth/` | 登録・ログイン・リフレッシュ(ローテーションと再利用検知)・ログアウト、JWT ガード |
| `spots/` | スポットの CRUD・一覧・公開範囲(`viewableSpotsWhere`)・近くのスポット |
| `users/` `follows/` | プロフィール、フォロー |
| `likes/` `comments/` `lists/` | いいね、コメント、マイリスト |
| `photos/` | 写真: 署名付き URL の発行 → ブラウザが S3 へ直接アップロード → 完了の確認(実際の大きさ・形式で判断)。S3 とのやり取りは `photo-storage.service.ts` |
| `geocode/` | 住所の取得(逆ジオコーディング。ログイン必須)。Amazon Location Service を呼ぶ `AwsReverseGeocoder`(テストでは偽物に差し替える)。地図の表示範囲の API は、`spots/`(`GET /api/spots/map`) |
| `prisma/` | DB 接続、書き込みの競合(デッドロック)時の再試行(`retry.ts`) |
| `openapi/` | OpenAPI の生成と Swagger UI |
| `common/` | 共通の部品 |

`prisma/schema.prisma` がデータモデル、`test/*.e2e-spec.ts` が結合テストです。結合テストは、ファイルごとに専用のメール接頭辞を使い、終了時に自分のデータだけを消します(並列実行でも干渉しません)。

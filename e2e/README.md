# E2E テスト(Playwright)

バックエンド(NestJS)とフロント(Nuxt)を実際に起動し、ブラウザで主要な流れを確認します。
方針と構成は `docs/20_設計書.md` の「テストの方針」「E2E の構成」を参照してください。

## 前提
- Docker Desktop が起動していて、DB と、写真の置き場(S3 互換のサーバー、S3Mock)が動いている(`docker compose up -d db s3`)
- E2E 用の DB `tripdiary_e2e` がある(新しく作った DB なら自動で作成済み。既存の DB には設計書の手順で一度だけ作成)
- 初回のみ: `npm install` と `npx playwright install chromium`

## 実行
```bash
cd e2e
npm test              # 全テスト(バックエンド・フロントは自動で起動する)
npm run test:headed   # ブラウザを表示して実行
npm run test:ui       # Playwright の UI モードで実行
npm run report        # 直前の HTML レポートを開く
npx playwright test -g "新規登録"   # 名前で絞り込む
```

開発用とは別のポート(バックエンド 3100、フロント 5174)と DB を使うので、開発サーバーを起動したままでも実行できます。

## 構成
| パス | 役割 |
|---|---|
| `playwright.config.ts` | 設定。`webServer` でバックエンドとフロントを起動する |
| `global-setup.ts` / `global-teardown.ts` | 実行前: マイグレーション・残りの削除・ウォームアップ。実行後: テスト用ユーザーの削除 |
| `fixtures/api.ts` | API でユーザー・投稿を作る、ブラウザをログイン済みにする |
| `pages/` | ページオブジェクト(ログイン、投稿フォーム) |
| `tests/` | テスト本体(`auth`、`spots`、`photos`、`map`、`paging`、`security`、`a11y`、`responsive` など) |
| `support/` | 接続先の設定(DB・ポート・S3)、DB の後始末、アクセシビリティの検査(`a11y.ts`)、テスト用の PNG の生成(`png.ts`) |

## テストを書くときの決まり
- ユーザーも投稿名もテストごとに一意にする(`registerUser`、`uniqueName`)。結果は自分のデータだけで判定する
- 件数を厳密に確認したいときは、他のテストが使わないエリアを専用にする(`paging.spec.ts` を参照)
- URL の確認はパス名で厳密に、再試行つきで行う(`expect(page).toHaveURL((url) => url.pathname === "/spots/new")`)。ログイン直後はユーザー名がページ移動より先に出る
- 失敗の原因を調べたいときは `E2E_KEEP_DATA=1 npm test` でデータを残せる(後で `tripdiary_e2e` から接頭辞 `e2e_` のユーザーを削除する)

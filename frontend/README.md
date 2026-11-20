# frontend(Nuxt SPA)

TripDiary の画面です。Nuxt 4(SPA、`ssr: false`)+ Pinia + Tailwind CSS 4。全体の説明とローカルでの起動手順は、[ルートの README](../README.md) を参照してください。

## 起動

```bash
npm install
npm run dev     # http://localhost:5173
```

開発サーバーは `/api` をバックエンド(既定 `http://localhost:3000/api`)へ転送します。転送先は環境変数 `API_PROXY_TARGET` で変えられます。バックエンドを先に起動してください。

## コマンド

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバー |
| `npm run lint` | ESLint |
| `npm run typecheck` | 型検査(`nuxt typecheck`) |
| `npm test` | 単体テスト(Vitest + Vue Test Utils。Windows では PowerShell から実行) |
| `npm run generate` | 静的ファイルを出力(`.output/public`。S3 + CloudFront で配信する) |

## 構成(`app/`)

| ディレクトリ | 役割 |
|---|---|
| `pages/` | 画面(ホーム、ログイン、スポット詳細・投稿・編集、マイリスト、プロフィールなど。URL は [docs/21_画面設計.md](../docs/21_画面設計.md)) |
| `components/` | 部品(スポットのカード、コメント欄、いいねなど) |
| `composables/` `stores/` | API 呼び出し・認証の状態(Pinia) |
| `utils/` | 共通の関数 |

画面は、E2E(`../e2e`)から見つけやすいよう、操作する要素に `data-testid` を付けています。


## 地図

- MapLibre GL JS で、Amazon Location Service の地図を表示します(`components/SpotMap.vue`)。**AWS の地図の表示には、ビルドのときの環境変数 `NUXT_PUBLIC_MAP_IDENTITY_POOL_ID`(Cognito の ID プール)が要ります**。指定がなければ、地図の絵のない背景になり(開発・テスト用)、AWS に接続せずに、ピン・クリック・ドラッグだけを確かめられます。
- 住所の取得(「現在地から入力」)は、バックエンドの API(`GET /api/geocode/reverse`)を呼びます。
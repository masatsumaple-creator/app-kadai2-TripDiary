import tailwindcss from '@tailwindcss/vite'

// 本番のビルドでは HIDE_MOCK=true を付け、ダミーデータの画面(/mock、/map)を含めない(docs/22_インフラ設計.md の D7)。
// 地図(S-08)を実装したら、/map を戻す
const hideMock = process.env.HIDE_MOCK === 'true'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  // E2E(e2e/)では NUXT_DEVTOOLS=false で無効にする(初回アクセス時の再読み込みを避けるため)
  devtools: { enabled: process.env.NUXT_DEVTOOLS !== 'false' },
  typescript: {
    // テストで vitest のグローバル(describe / it / vi)を使う
    tsConfig: { compilerOptions: { types: ['vitest/globals'] } },
  },
  // SPA(静的出力)。S3 + CloudFront で配信する
  ssr: false,
  // バックエンド(3000)と衝突しないよう固定する
  devServer: { port: 5173 },
  modules: ['@nuxt/eslint', '@pinia/nuxt'],
  app: {
    head: {
      htmlAttrs: { lang: 'ja' },
      // 題名を付けていない画面の既定。画面ごとの題名は useHead({ title }) で付ける(app.vue のテンプレートで「<題名> | TripDiary」になる)
      title: 'TripDiary',
    },
  },
  css: ['~/assets/css/main.css'],
  runtimeConfig: { public: { hideMock } },
  hooks: {
    // ルートごと外すので、画面もダミーデータも、ビルドに入らない(URL を直接開いても 404)
    'pages:extend'(pages) {
      if (!hideMock) return
      for (let i = pages.length - 1; i >= 0; i--) {
        const path = pages[i]!.path
        if (path === '/map' || path === '/mock' || path.startsWith('/mock/')) pages.splice(i, 1)
      }
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
  // 開発時のみ /api をバックエンド(NestJS)へ転送し、本番と同じ同一オリジン構成にする
  nitro: {
    devProxy: {
      '/api': { target: process.env.API_PROXY_TARGET ?? 'http://localhost:3000/api', changeOrigin: true },
    },
  },
})

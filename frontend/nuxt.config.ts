import tailwindcss from '@tailwindcss/vite'

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
  css: ['~/assets/css/main.css'],
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

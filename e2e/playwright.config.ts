import { defineConfig, devices } from '@playwright/test'
import {
  BACKEND_DIR,
  BACKEND_PORT,
  BACKEND_URL,
  BASE_URL,
  DATABASE_URL,
  FRONTEND_DIR,
  FRONTEND_PORT,
  JWT_SECRET,
} from './support/env'

const isCI = !!process.env['CI']

export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',
  // テストごとに別のユーザーを作るため、並列に実行できる
  fullyParallel: true,
  workers: isCI ? 2 : undefined,
  forbidOnly: isCI,
  // 開発サーバーの揺らぎで稀に落ちることがあるため、CI では 1 回だけ再試行する
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'functional',
      testIgnore: /paging\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // 専用エリアの件数を厳密に確認するテスト。ファイル内の並列実行を切り、1 つずつ実行する
      name: 'paging',
      testMatch: /paging\.spec\.ts/,
      fullyParallel: false,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // バックエンドとフロントを、E2E 専用のポート・DB で起動する(起動済みなら再利用する)
  webServer: [
    {
      command: 'npm run start',
      cwd: BACKEND_DIR,
      url: `${BACKEND_URL}/api/health`,
      reuseExistingServer: !isCI,
      timeout: 120_000,
      env: {
        PORT: String(BACKEND_PORT),
        DATABASE_URL,
        JWT_SECRET,
      },
    },
    {
      command: `npm run dev -- --port ${FRONTEND_PORT}`,
      cwd: FRONTEND_DIR,
      url: BASE_URL,
      reuseExistingServer: !isCI,
      timeout: 180_000,
      env: {
        // 開発サーバーの /api を、E2E 用のバックエンドへ転送する
        API_PROXY_TARGET: `${BACKEND_URL}/api`,
        // DevTools は、初回アクセス時の再読み込みの原因になるため無効にする
        NUXT_DEVTOOLS: 'false',
      },
    },
  ],
})

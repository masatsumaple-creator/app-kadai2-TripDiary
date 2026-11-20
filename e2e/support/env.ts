import path from 'node:path'
import { fileURLToPath } from 'node:url'

// E2E 専用の設定。開発用の DB・ポートとは分けてある(開発中のデータに触れない)
export const BACKEND_PORT = 3100
export const FRONTEND_PORT = 5174

export const BASE_URL = `http://localhost:${FRONTEND_PORT}`
export const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`

// CI でも同じ値になるよう、CI の MySQL サービス(ci.yml)の設定と揃えてある
export const DATABASE_URL =
  process.env['E2E_DATABASE_URL'] ?? 'mysql://tripdiary:tripdiary@127.0.0.1:3306/tripdiary_e2e'

// テスト専用の値(本物の秘密情報ではない)
export const JWT_SECRET = 'e2e-only-jwt-secret-not-used-anywhere-else'

// 写真の置き場(S3 互換のサーバー。docker compose up -d s3 の S3Mock)。CI でも同じ値(ci.yml のサービス)
export const S3_ENDPOINT = process.env['E2E_S3_ENDPOINT'] ?? 'http://localhost:9090'
export const S3_BUCKET = 'tripdiary-e2e'

// E2E が作るユーザーのメールの接頭辞。後始末で、この接頭辞のユーザーだけを消す
export const E2E_EMAIL_PREFIX = 'e2e_'

const here = path.dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = path.resolve(here, '..', '..')
export const BACKEND_DIR = path.join(REPO_ROOT, 'backend')
export const FRONTEND_DIR = path.join(REPO_ROOT, 'frontend')

// 写真の決まり(docs/00_要件定義書.md の制約。docs/21_画面設計.md の S-05 と同じ値)

// 1 枚の上限(バイト)
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

// 1 投稿あたりの上限
export const PHOTO_MAX_COUNT = 20;

// 受け付ける形式(Content-Type → ファイルの拡張子)
export const PHOTO_CONTENT_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;
export type PhotoContentType = keyof typeof PHOTO_CONTENT_TYPES;
export const PHOTO_CONTENT_TYPE_LIST = Object.keys(
  PHOTO_CONTENT_TYPES,
) as PhotoContentType[];

// アップロード用の URL の有効期間(秒)
export const UPLOAD_URL_TTL_SECONDS = 5 * 60;

// 表示用の URL の有効期間(秒)。公開範囲は、URL を発行した時点で確認している(期限が切れたら、API から取り直す)
export const VIEW_URL_TTL_SECONDS = 60 * 60;

// URL を発行したが、アップロードの完了が確認できない写真(pending)を、有効とみなす時間(ミリ秒)。
// これを過ぎたものは、上限の数に数えず、次のアップロードの発行のときに片付ける
export const PENDING_TTL_MS = 60 * 60 * 1000;

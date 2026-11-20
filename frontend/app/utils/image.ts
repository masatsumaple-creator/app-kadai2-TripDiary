// 写真の縮小(ブラウザ側)。アップロードの前に、長辺 1600px 以下の JPEG にする(docs/00_要件定義書.md)。
// - 通信量と保存量を減らす
// - **撮影場所などの情報(EXIF)が、画像から消える**(canvas で描き直すため。意図せず、位置情報を公開しない)
// - 向き(EXIF の回転)は、描くときに反映する
import { PHOTO_MAX_BYTES, planResize, PHOTO_MAX_EDGE } from './photos'

const QUALITIES = [0.85, 0.75, 0.65, 0.5]

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
}

// 画像として読めないとき・縮小しても 5MB を超えるときは、例外(利用者に見せるメッセージつき)
export async function resizeToJpeg(file: File): Promise<Blob> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new Error(`${file.name}: 画像として読み込めませんでした。`)
  }

  const { width, height } = planResize(bitmap.width, bitmap.height, PHOTO_MAX_EDGE)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error(`${file.name}: 画像を処理できませんでした。`)
  // 透明な部分は、JPEG では黒くなるため、白で塗ってから描く
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  for (const quality of QUALITIES) {
    const blob = await toBlob(canvas, quality)
    if (blob && blob.size <= PHOTO_MAX_BYTES) return blob
  }
  throw new Error(`${file.name}: 縮小しても 5MB を超えるため、追加できません。`)
}

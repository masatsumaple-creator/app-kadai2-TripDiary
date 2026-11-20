import { crc32, deflateSync } from 'node:zlib'

// テスト用の PNG を作る(単色。外部のライブラリも、画像ファイルも要らない)。
// 縮小のテストに、大きい画像が要るため、サイズを指定できる
function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const out = Buffer.alloc(body.length + 8)
  out.writeUInt32BE(data.length, 0)
  body.copy(out, 4)
  out.writeUInt32BE(crc32(body), body.length + 4)
  return out
}

export function makePng(width: number, height: number, rgb: [number, number, number] = [30, 144, 255]): Buffer {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.writeUInt8(8, 8) // 8 ビット
  header.writeUInt8(2, 9) // RGB
  // 各行: フィルター(0)+ 画素。行ごとに少し色を変えて、完全な単色にはしない
  const row = Buffer.alloc(1 + width * 3)
  const raw = Buffer.alloc(row.length * height)
  for (let y = 0; y < height; y++) {
    row[0] = 0
    for (let x = 0; x < width; x++) {
      row[1 + x * 3] = rgb[0]
      row[2 + x * 3] = (rgb[1] + (y % 32)) % 256
      row[3 + x * 3] = rgb[2]
    }
    row.copy(raw, y * row.length)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// setInputFiles に渡す形
export const pngFile = (name: string, width: number, height: number, rgb?: [number, number, number]) => ({
  name,
  mimeType: 'image/png',
  buffer: makePng(width, height, rgb),
})

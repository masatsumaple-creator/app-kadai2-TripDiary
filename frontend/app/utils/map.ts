// 地図の設定と、ブラウザの機能に依存しない計算(docs/20_設計書.md の「地図」)。
// 地図の描画そのものは components/SpotMap.vue(MapLibre GL JS)

export interface LngLat {
  lat: number
  lng: number
}

export interface MapView extends LngLat {
  zoom: number
}

// 日本全体が見える、初期の表示
export const DEFAULT_VIEW: MapView = { lat: 37.5, lng: 137.5, zoom: 4.3 }

export const MIN_ZOOM = 1
export const MAX_ZOOM = 18

// 数値の文字列だけを数値にする(空・空白・数値以外は null)
function toFiniteNumber(v: unknown): number | null {
  if (typeof v !== 'string' || v.trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// URL のクエリ(?lat=…&lng=…&zoom=…)から、表示の位置を決める(共有できる URL・テストで使う)。
// lat・lng のどちらかが不正・範囲外なら、初期の表示。zoom は、なければ 12、範囲外は端に丸める
export function parseMapView(query: Record<string, unknown>): MapView {
  const lat = toFiniteNumber(query['lat'])
  const lng = toFiniteNumber(query['lng'])
  if (lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return DEFAULT_VIEW
  }
  const zoom = toFiniteNumber(query['zoom'])
  return { lat, lng, zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom ?? 12)) }
}

export interface Bounds {
  swLat: number
  swLng: number
  neLat: number
  neLng: number
}

// 表示範囲を、API のクエリ用にする。小数は 5 桁(約 1m)に丸め、緯度は南北の端(±90)に、
// 経度は ±180 に収める(地図を横にずらして、地球を 1 周以上した範囲になっても、API が 400 にしないように)
export function toBounds(b: { south: number; west: number; north: number; east: number }): Bounds {
  const round = (n: number) => Math.round(n * 1e5) / 1e5
  const lat = (n: number) => Math.min(90, Math.max(-90, round(n)))
  const wrapLng = (n: number) => {
    // 範囲(-180〜180)に折り返す(180 は 180 のまま)
    if (n >= -180 && n <= 180) return round(n)
    return round((((n + 180) % 360) + 360) % 360 - 180)
  }
  const span = b.east - b.west
  // 経度の幅が 360 度以上なら、世界全体
  if (span >= 360) return { swLat: lat(b.south), swLng: -180, neLat: lat(b.north), neLng: 180 }
  return { swLat: lat(b.south), swLng: wrapLng(b.west), neLat: lat(b.north), neLng: wrapLng(b.east) }
}

export function boundsToQuery(b: Bounds, area?: string): string {
  const q = new URLSearchParams({
    swLat: String(b.swLat),
    swLng: String(b.swLng),
    neLat: String(b.neLat),
    neLng: String(b.neLng),
  })
  if (area) q.set('area', area)
  return `?${q.toString()}`
}

// 緯度・経度の表示(小数 6 桁。約 0.1m)
export function formatLatLng(p: LngLat): string {
  return `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`
}

export interface MapConfig {
  // AWS: Amazon Location Service の地図(Cognito の ID プールで認証)。offline: 地図の絵なし(開発・テスト用)
  kind: 'aws' | 'offline'
  styleUrl?: string
  identityPoolId?: string
}

// 地図の設定を決める。ID プールの指定(NUXT_PUBLIC_MAP_IDENTITY_POOL_ID)があれば AWS の地図、なければ、地図の絵なしの背景
// (開発・CI では、AWS に接続せずに、ピンやクリックの操作だけを確かめられる)
export function resolveMapConfig(pool: { identityPoolId?: string; region?: string }): MapConfig {
  const identityPoolId = pool.identityPoolId?.trim()
  if (!identityPoolId) return { kind: 'offline' }
  const region = pool.region?.trim() || 'ap-northeast-1'
  return {
    kind: 'aws',
    identityPoolId,
    styleUrl: `https://maps.geo.${region}.amazonaws.com/v2/styles/Standard/descriptor`,
  }
}

// 地図の絵なしの背景(タイルを取りに行かない)。ピン・ドラッグ・クリックは、そのまま動く
export const OFFLINE_STYLE = {
  version: 8 as const,
  sources: {},
  layers: [{ id: 'background', type: 'background' as const, paint: { 'background-color': '#e6eef5' } }],
}

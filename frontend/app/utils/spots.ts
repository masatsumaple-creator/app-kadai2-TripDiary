import type { Visibility } from './spotMeta'

// バックエンドの応答の型(docs/20_設計書.md のスポット API)
export interface Author {
  id: number
  name: string
}

export interface SpotListItem {
  id: number
  name: string
  areas: string[]
  visibility: Visibility
  author: Author
  isMine: boolean
  createdAt: string
}

export interface SpotListResponse {
  items: SpotListItem[]
  nextCursor: number | null
}

export interface Spot extends SpotListItem {
  review: string | null
  address: string | null
  latitude: number | null
  longitude: number | null
  updatedAt: string
}

export interface SpotInput {
  name: string
  review: string | null
  address: string | null
  latitude: number | null
  longitude: number | null
  areas: string[]
  visibility: Visibility
}

// フォームの入力状態(文字列は未加工)
export interface SpotFormState {
  name: string
  review: string
  address: string
  latitude: number | null
  longitude: number | null
  areas: string[]
  visibility: Visibility
}

export function emptySpotForm(): SpotFormState {
  return {
    name: '',
    review: '',
    address: '',
    latitude: null,
    longitude: null,
    areas: [],
    visibility: 'public',
  }
}

export function spotToForm(spot: Spot): SpotFormState {
  return {
    name: spot.name,
    review: spot.review ?? '',
    address: spot.address ?? '',
    latitude: spot.latitude,
    longitude: spot.longitude,
    areas: [...spot.areas],
    visibility: spot.visibility,
  }
}

// 前後の空白を除き、空欄は null にして API へ送る形にする
export function toSpotInput(form: SpotFormState): SpotInput {
  const blankToNull = (v: string) => (v.trim() === '' ? null : v.trim())
  return {
    name: form.name.trim(),
    review: blankToNull(form.review),
    address: blankToNull(form.address),
    latitude: form.latitude,
    longitude: form.longitude,
    areas: form.areas,
    visibility: form.visibility,
  }
}

export interface ListParams {
  area?: string
  cursor?: number | null
  limit?: number
}

export function buildListQuery({ area, cursor, limit }: ListParams): string {
  const q = new URLSearchParams()
  if (area) q.set('area', area)
  if (cursor) q.set('cursor', String(cursor))
  if (limit) q.set('limit', String(limit))
  const s = q.toString()
  return s ? `?${s}` : ''
}

// 一覧・詳細で共通のカード表示用
export interface CardSpot {
  id: number
  name: string
  areas: string[]
  visibility: Visibility
  authorName: string
  // 本実装ではまだ持っていない項目(モック画面でのみ使う)
  likes?: number
  photoCount?: number
  hue?: number
}

export function toCardSpot(item: SpotListItem): CardSpot {
  return {
    id: item.id,
    name: item.name,
    areas: item.areas,
    visibility: item.visibility,
    authorName: item.author.name,
  }
}

// 写真のない投稿のカードの色。ID から決めて、毎回同じ色にする
export function hueOf(id: number): number {
  return (id * 47) % 360
}

// 近くのスポット: 同じエリアタグの他の投稿を新着順に最大 5 件(要件定義書の F-19)。
// 複数のエリアタグがある場合は、いずれかに一致する投稿を ID の降順でまとめる
export function mergeNearby(
  lists: SpotListItem[][],
  selfId: number,
  limit = 5,
): SpotListItem[] {
  const byId = new Map<number, SpotListItem>()
  for (const item of lists.flat())
    if (item.id !== selfId) byId.set(item.id, item)
  return [...byId.values()].sort((a, b) => b.id - a.id).slice(0, limit)
}

// 地図に置く点。モックのスポットも本実装のスポットも、この形に当てはまる
export interface MapPoint {
  id: number
  name: string
  lat: number
  lng: number
}

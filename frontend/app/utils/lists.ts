import type { SpotListItem } from './spots'

// バックエンドの応答の型(docs/20_設計書.md のマイリスト API)
export type ListStatus = 'visited' | 'wishlist'

export const listStatusLabels: Record<ListStatus, string> = {
  visited: '訪問済み',
  wishlist: '行きたい',
}

export interface ListCounts {
  visited: number
  wishlist: number
}

export interface MyListResponse {
  items: SpotListItem[]
  nextCursor: number | null
  counts: ListCounts
}

export interface ListEntryState {
  // 操作後の状態。リストから外したら null
  status: ListStatus | null
}

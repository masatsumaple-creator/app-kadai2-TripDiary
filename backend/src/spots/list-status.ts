// マイリストの状態。visited: 訪問済み、wishlist: 行きたい
// (DB の enum `ListStatus` と同じ値。投稿の詳細と、マイリストの API で共通に使う)
export const LIST_STATUSES = ['visited', 'wishlist'] as const;
export type ListStatusValue = (typeof LIST_STATUSES)[number];

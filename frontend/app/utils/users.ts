// バックエンドの応答の型(docs/20_設計書.md のプロフィール API・フォロー API)
export interface UserProfile {
  id: number
  name: string
  followerCount: number
  followingCount: number
  // 閲覧者が見られる投稿の数(他人の非公開などは数えない)
  spotCount: number
  isMe: boolean
  isFollowing: boolean
}

export interface FollowState {
  isFollowing: boolean
  followerCount: number
}

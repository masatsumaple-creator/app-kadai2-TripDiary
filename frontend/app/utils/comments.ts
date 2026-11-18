// バックエンドの応答の型(docs/20_設計書.md のコメント API)
export interface Comment {
  id: number
  body: string
  author: { id: number; name: string }
  createdAt: string
  // 閲覧者が削除できるか(コメントした本人、または投稿者)
  canDelete: boolean
}

export interface CommentListResponse {
  items: Comment[]
  nextCursor: number | null
}

// バックエンドの上限と揃える(CreateCommentDto)
export const COMMENT_MAX_LENGTH = 500

// 送信できる内容か。前後の空白を除いて 1〜500 文字
export function isCommentSubmittable(text: string): boolean {
  const length = text.trim().length
  return length >= 1 && length <= COMMENT_MAX_LENGTH
}

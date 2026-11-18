import { describe, expect, it } from 'vitest'
import { COMMENT_MAX_LENGTH, isCommentSubmittable } from './comments'

describe('isCommentSubmittable', () => {
  it('前後の空白を除いて 1〜500 文字なら送信できる', () => {
    expect(isCommentSubmittable('a')).toBe(true)
    expect(isCommentSubmittable('  こんにちは  ')).toBe(true)
    expect(isCommentSubmittable('あ'.repeat(COMMENT_MAX_LENGTH))).toBe(true)
  })

  it('空や空白だけは送信できない', () => {
    expect(isCommentSubmittable('')).toBe(false)
    expect(isCommentSubmittable('   ')).toBe(false)
    expect(isCommentSubmittable('\n\t ')).toBe(false)
  })

  it('501 文字以上は送信できない。空白は文字数に数えない', () => {
    expect(isCommentSubmittable('あ'.repeat(COMMENT_MAX_LENGTH + 1))).toBe(false)
    expect(isCommentSubmittable(` ${'あ'.repeat(COMMENT_MAX_LENGTH)} `)).toBe(true)
  })

  it('バックエンドの上限(500 文字)と揃えてある', () => {
    expect(COMMENT_MAX_LENGTH).toBe(500)
  })
})

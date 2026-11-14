import { describe, expect, it } from 'vitest'
import { safeRedirect } from './redirect'

describe('safeRedirect', () => {
  it('サイト内のパスはそのまま返す', () => {
    expect(safeRedirect('/spots/new')).toBe('/spots/new')
    expect(safeRedirect('/me/list?tab=want')).toBe('/me/list?tab=want')
  })

  it('外部サイトへの URL は / にする', () => {
    expect(safeRedirect('https://evil.example.com')).toBe('/')
    expect(safeRedirect('//evil.example.com')).toBe('/')
    expect(safeRedirect('/\\evil.example.com')).toBe('/')
  })

  it('文字列以外や未指定は / にする', () => {
    expect(safeRedirect(undefined)).toBe('/')
    expect(safeRedirect(['/a', '/b'])).toBe('/')
    expect(safeRedirect('')).toBe('/')
  })
})

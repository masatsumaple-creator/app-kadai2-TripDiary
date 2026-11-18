import { describe, expect, it } from 'vitest'
import { listStatusLabels } from './lists'

describe('listStatusLabels', () => {
  it('状態ごとの表示名を持つ(要件の用語: 訪問済み / 行きたい)', () => {
    expect(listStatusLabels).toEqual({ visited: '訪問済み', wishlist: '行きたい' })
  })
})

import { describe, expect, it } from 'vitest'
import { findNearbySpots, findSpot, mockSpots } from './mockData'

describe('findNearbySpots', () => {
  it('同じエリアタグの他の公開投稿を新着順で返す', () => {
    const aso = findSpot(5)!
    expect(findNearbySpots(aso).map((s) => s.id)).toEqual([8, 7])
  })

  it('表示中の投稿自身は含めない', () => {
    const kumamoto = findSpot(7)!
    expect(findNearbySpots(kumamoto).some((s) => s.id === 7)).toBe(false)
  })

  it('公開以外の投稿は含めない', () => {
    const kanazawa = { ...findSpot(4)!, id: 99, visibility: 'public' as const }
    expect(findNearbySpots(kanazawa)).toEqual([])
  })

  it('最大 5 件まで', () => {
    const base = findSpot(1)!
    const extra = Array.from({ length: 8 }, (_, i) => ({ ...base, id: 100 + i }))
    mockSpots.push(...extra)
    try {
      expect(findNearbySpots(findSpot(9)!)).toHaveLength(5)
    } finally {
      mockSpots.splice(mockSpots.length - extra.length, extra.length)
    }
  })

  it('該当がなければ空', () => {
    expect(findNearbySpots(findSpot(2)!)).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import {
  buildListQuery,
  emptySpotForm,
  hueOf,
  mergeNearby,
  spotToForm,
  toCardSpot,
  toSpotInput,
  type Spot,
  type SpotListItem,
} from './spots'

const item = (id: number, overrides: Partial<SpotListItem> = {}): SpotListItem => ({
  id,
  name: `spot-${id}`,
  areas: ['京都府'],
  visibility: 'public',
  author: { id: 1, name: 'はるか' },
  isMine: false,
  createdAt: '2026-11-14T00:00:00.000Z',
  ...overrides,
})

describe('toSpotInput', () => {
  it('前後の空白を除き、空欄は null にする', () => {
    const form = { ...emptySpotForm(), name: '  清水寺  ', review: '   ', address: ' 京都府 ', areas: ['京都府'] }
    expect(toSpotInput(form)).toEqual({
      name: '清水寺',
      review: null,
      address: '京都府',
      latitude: null,
      longitude: null,
      areas: ['京都府'],
      visibility: 'public',
    })
  })

  it('緯度経度はそのまま渡す', () => {
    const form = { ...emptySpotForm(), name: 'a', latitude: 35.1, longitude: 139.2, areas: ['東京都'] }
    expect(toSpotInput(form)).toMatchObject({ latitude: 35.1, longitude: 139.2 })
  })
})

describe('spotToForm', () => {
  it('API の null を空文字にして、フォームに入れられる形にする', () => {
    const spot: Spot = {
      ...item(1),
      review: null,
      address: null,
      latitude: null,
      longitude: null,
      updatedAt: '2026-11-14T00:00:00.000Z',
    }
    expect(spotToForm(spot)).toEqual({
      name: 'spot-1',
      review: '',
      address: '',
      latitude: null,
      longitude: null,
      areas: ['京都府'],
      visibility: 'public',
    })
  })

  it('エリアの配列は複製する(フォームの編集が元のデータに影響しない)', () => {
    const spot: Spot = { ...item(1), review: null, address: null, latitude: null, longitude: null, updatedAt: '' }
    const form = spotToForm(spot)
    form.areas.push('大阪府')
    expect(spot.areas).toEqual(['京都府'])
  })
})

describe('buildListQuery', () => {
  it('指定した項目だけをクエリにする', () => {
    expect(buildListQuery({})).toBe('')
    expect(buildListQuery({ area: '', cursor: null })).toBe('')
    expect(buildListQuery({ area: '京都府' })).toBe('?area=%E4%BA%AC%E9%83%BD%E5%BA%9C')
    expect(buildListQuery({ cursor: 12, limit: 6 })).toBe('?cursor=12&limit=6')
  })
})

describe('toCardSpot / hueOf', () => {
  it('一覧の項目をカード表示用にする(まだない項目は持たせない)', () => {
    expect(toCardSpot(item(3))).toEqual({
      id: 3,
      name: 'spot-3',
      areas: ['京都府'],
      visibility: 'public',
      authorName: 'はるか',
    })
  })

  it('色は ID から決まり、毎回同じ', () => {
    expect(hueOf(5)).toBe(hueOf(5))
    expect(hueOf(1)).not.toBe(hueOf(2))
    expect(hueOf(1000)).toBeLessThan(360)
  })
})

describe('mergeNearby', () => {
  it('自分自身を除き、新しい順(ID の降順)で最大 5 件にする', () => {
    const merged = mergeNearby([[item(1), item(2), item(3)], [item(4), item(5), item(6), item(7)]], 3)
    expect(merged.map((s) => s.id)).toEqual([7, 6, 5, 4, 2])
  })

  it('複数のエリアで重複した投稿は 1 件にまとめる', () => {
    const merged = mergeNearby([[item(1), item(2)], [item(2), item(3)]], 99)
    expect(merged.map((s) => s.id)).toEqual([3, 2, 1])
  })

  it('該当がなければ空', () => {
    expect(mergeNearby([[item(1)], []], 1)).toEqual([])
    expect(mergeNearby([], 1)).toEqual([])
  })
})

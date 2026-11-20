import { describe, expect, it } from 'vitest'
import {
  boundsToQuery,
  DEFAULT_VIEW,
  formatLatLng,
  labelLanguageUpdates,
  MAX_ZOOM,
  MIN_ZOOM,
  OFFLINE_STYLE,
  parseMapView,
  resolveMapConfig,
  toBounds,
} from './map'

describe('parseMapView(URL のクエリから、表示の位置を決める)', () => {
  it('lat・lng があれば、その位置(zoom がなければ 12)', () => {
    expect(parseMapView({ lat: '-45.5', lng: '170.25' })).toEqual({ lat: -45.5, lng: 170.25, zoom: 12 })
    expect(parseMapView({ lat: '35', lng: '139', zoom: '9.5' })).toEqual({ lat: 35, lng: 139, zoom: 9.5 })
  })

  it('指定がない・不正・範囲外なら、日本全体の初期の表示', () => {
    for (const q of [
      {},
      { lat: '35' },
      { lng: '139' },
      { lat: 'abc', lng: '139' },
      { lat: '', lng: '' },
      { lat: '91', lng: '139' },
      { lat: '35', lng: '181' },
      { lat: 'NaN', lng: '1' },
      { lat: 'Infinity', lng: '1' },
      { lat: ['35', '36'], lng: '139' },
    ]) {
      expect(parseMapView(q), JSON.stringify(q)).toEqual(DEFAULT_VIEW)
    }
  })

  it('zoom は、範囲の端に丸める。数値でなければ 12', () => {
    expect(parseMapView({ lat: '0', lng: '0', zoom: '99' }).zoom).toBe(MAX_ZOOM)
    expect(parseMapView({ lat: '0', lng: '0', zoom: '-5' }).zoom).toBe(MIN_ZOOM)
    expect(parseMapView({ lat: '0', lng: '0', zoom: 'abc' }).zoom).toBe(12)
  })
})

describe('toBounds(地図の表示範囲を、API 用にする)', () => {
  it('小数は 5 桁に丸める', () => {
    expect(toBounds({ south: 34.123456789, west: 135.987654321, north: 35.5, east: 136.5 })).toEqual({
      swLat: 34.12346,
      swLng: 135.98765,
      neLat: 35.5,
      neLng: 136.5,
    })
  })

  it('緯度は ±90 に収める(地図を端まで動かしても、API が 400 にしない)', () => {
    const b = toBounds({ south: -95, west: 0, north: 95, east: 10 })
    expect(b.swLat).toBe(-90)
    expect(b.neLat).toBe(90)
  })

  it('経度が ±180 を超えたら、折り返す(日付変更線をまたぐ範囲になる)', () => {
    // 東経 170 から、東経 190(= 西経 170)まで
    expect(toBounds({ south: 0, west: 170, north: 1, east: 190 })).toMatchObject({ swLng: 170, neLng: -170 })
    // 西経 190(= 東経 170)から、西経 170 まで
    expect(toBounds({ south: 0, west: -190, north: 1, east: -170 })).toMatchObject({ swLng: 170, neLng: -170 })
  })

  it('経度の幅が 360 度以上なら、世界全体(-180〜180)', () => {
    expect(toBounds({ south: 0, west: -200, north: 1, east: 200 })).toMatchObject({ swLng: -180, neLng: 180 })
  })

  it('範囲内の経度は、そのまま。±180 ちょうども、そのまま', () => {
    expect(toBounds({ south: 0, west: -180, north: 1, east: 180 })).toMatchObject({ swLng: -180, neLng: 180 })
  })
})

describe('boundsToQuery', () => {
  const b = { swLat: 1, swLng: 2, neLat: 3, neLng: 4 }

  it('範囲をクエリにする', () => {
    expect(boundsToQuery(b)).toBe('?swLat=1&swLng=2&neLat=3&neLng=4')
  })

  it('エリアは、あるときだけ付ける(URL エンコードする)', () => {
    expect(boundsToQuery(b, '京都府')).toBe(`?swLat=1&swLng=2&neLat=3&neLng=4&area=${encodeURIComponent('京都府')}`)
    expect(boundsToQuery(b, '')).not.toContain('area')
  })
})

describe('formatLatLng', () => {
  it('小数 6 桁で表示する', () => {
    expect(formatLatLng({ lat: 34.9949, lng: 135.785 })).toBe('34.994900, 135.785000')
    expect(formatLatLng({ lat: -0.1, lng: -179.9999999 })).toBe('-0.100000, -180.000000')
  })
})

describe('resolveMapConfig(AWS の地図か、地図の絵なしの背景か)', () => {
  it('ID プールの指定がなければ、地図の絵なし(AWS に接続しない)', () => {
    for (const p of [{}, { identityPoolId: '' }, { identityPoolId: '   ' }, { identityPoolId: undefined, region: 'us-east-1' }]) {
      expect(resolveMapConfig(p)).toEqual({ kind: 'offline' })
    }
  })

  it('ID プールの指定があれば、そのリージョンの Maps v2 の Standard スタイル', () => {
    expect(resolveMapConfig({ identityPoolId: 'ap-northeast-1:abc', region: 'ap-northeast-1' })).toEqual({
      kind: 'aws',
      identityPoolId: 'ap-northeast-1:abc',
      styleUrl: 'https://maps.geo.ap-northeast-1.amazonaws.com/v2/styles/Standard/descriptor',
    })
  })

  it('リージョンの指定がなければ、東京', () => {
    expect(resolveMapConfig({ identityPoolId: 'x:y' }).styleUrl).toContain('maps.geo.ap-northeast-1.amazonaws.com')
    expect(resolveMapConfig({ identityPoolId: 'x:y', region: '  ' }).styleUrl).toContain('ap-northeast-1')
  })
})

describe('OFFLINE_STYLE', () => {
  it('タイルを取りに行かない(ソースがなく、背景だけ)', () => {
    expect(OFFLINE_STYLE.sources).toEqual({})
    expect(OFFLINE_STYLE.layers.map((l) => l.type)).toEqual(['background'])
  })
})

describe('labelLanguageUpdates(地図の文字を日本語優先にする)', () => {
  const english = ['coalesce', ['get', 'name:en'], ['get', 'name']]
  const layers = [
    { id: 'city', type: 'symbol', layout: { 'text-field': english } },
    { id: 'country', type: 'symbol', layout: { 'text-field': english, 'text-size': 14 } },
    { id: 'road-number', type: 'symbol', layout: { 'text-field': ['to-string', ['get', 'shield_text']] } },
    { id: 'house', type: 'symbol', layout: { 'text-field': ['to-string', ['get', 'addr_housenumber']] } },
    { id: 'icon-only', type: 'symbol', layout: { 'icon-image': 'x' } },
    { id: 'water', type: 'fill' },
    // 同じ指定でも、symbol 以外は、対象にしない
    { id: 'line-with-field', type: 'line', layout: { 'text-field': english } },
  ]

  it('英語名を優先している地名のレイヤーだけを、「日本語名 → 英語名 → 現地名」にする', () => {
    const updates = labelLanguageUpdates(layers)
    expect(updates.map((u) => u.id)).toEqual(['city', 'country'])
    expect((updates[0] as { expression: unknown }).expression).toEqual(['coalesce', ['get', 'name:ja'], ['get', 'name:en'], ['get', 'name']])
  })

  it('式の中に入れ子になった英語名の指定(拡大率で切り替える step など)も、その部分だけを書き換える', () => {
    const nested = [
      { id: 'country', type: 'symbol', layout: { 'text-field': ['step', ['zoom'], ['get', 'name:short'], 4, english] } },
      {
        id: 'region',
        type: 'symbol',
        layout: { 'text-field': ['step', ['zoom'], ['get', 'name:short'], 13, ['concat', english, ' (', ['get', 'name:short'], ')']] },
      },
    ]
    const ja = ['coalesce', ['get', 'name:ja'], ['get', 'name:en'], ['get', 'name']]
    expect(labelLanguageUpdates(nested)).toEqual([
      { id: 'country', expression: ['step', ['zoom'], ['get', 'name:short'], 4, ja] },
      { id: 'region', expression: ['step', ['zoom'], ['get', 'name:short'], 13, ['concat', ja, ' (', ['get', 'name:short'], ')']] },
    ])
  })

  it('道路の番号・番地・アイコンだけのレイヤー・symbol 以外は、触らない', () => {
    const ids = labelLanguageUpdates(layers).map((u) => u.id)
    for (const untouched of ['road-number', 'house', 'icon-only', 'water', 'line-with-field']) {
      expect(ids).not.toContain(untouched)
    }
  })

  it('言語を指定できる', () => {
    expect((labelLanguageUpdates(layers, 'ko')[0]!.expression as unknown[])[1]).toEqual(['get', 'name:ko'])
  })

  it('スタイルの指定が変わっていたら(一致しなければ)、何も変えない', () => {
    const changed = [{ id: 'city', type: 'symbol', layout: { 'text-field': ['get', 'name:latin'] } }]
    expect(labelLanguageUpdates(changed)).toEqual([])
    expect(labelLanguageUpdates([])).toEqual([])
  })
})

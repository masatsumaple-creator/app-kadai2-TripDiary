import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import SpotCard from './SpotCard.vue'

const spot = { id: 1, name: '清水寺', areas: ['京都府'], visibility: 'public' as const, authorName: 'はるか' }
const wrapper = (extra: object = {}) =>
  mount(SpotCard, { props: { spot: { ...spot, ...extra } }, global: { stubs: { NuxtLink: { template: '<a><slot /></a>' } } } })

describe('SpotCard', () => {
  it('代表の写真があれば、写真を表示する(代替テキストつき)', () => {
    const w = wrapper({ coverPhotoUrl: 'https://example.com/a.jpg' })
    const img = w.get('[data-testid="spot-card-photo"]')
    expect(img.attributes('src')).toBe('https://example.com/a.jpg')
    expect(img.attributes('alt')).toBe('清水寺の写真')
  })

  it('写真がなければ、色のグラデーション(写真の要素は出さない)', () => {
    for (const extra of [{}, { coverPhotoUrl: null }]) {
      const w = wrapper(extra)
      expect(w.find('[data-testid="spot-card-photo"]').exists()).toBe(false)
    }
  })
})

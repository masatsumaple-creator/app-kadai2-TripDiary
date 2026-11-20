import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import SpotPhotos from './SpotPhotos.vue'

const photos = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i + 1, url: `https://example.com/${i + 1}.jpg` }))
const wrapper = (n: number) => mount(SpotPhotos, { props: { photos: photos(n), name: '清水寺' } })
const mainSrc = (w: ReturnType<typeof wrapper>) => w.get('[data-testid="spot-photo-main"]').attributes('src')

describe('SpotPhotos', () => {
  it('写真がなければ、何も表示しない', () => {
    expect(wrapper(0).find('[data-testid="spot-photos"]').exists()).toBe(false)
  })

  it('1 枚だけなら、切り替えの部品を出さない', () => {
    const w = wrapper(1)
    expect(mainSrc(w)).toBe('https://example.com/1.jpg')
    expect(w.find('[data-testid="photo-prev"]').exists()).toBe(false)
    expect(w.find('[data-testid="photo-thumb"]').exists()).toBe(false)
  })

  it('複数枚なら、何枚中の何枚目かを代替テキストとカウンターで伝え、前後・サムネイルで切り替えられる', async () => {
    const w = wrapper(3)
    expect(w.get('[data-testid="spot-photo-main"]').attributes('alt')).toBe('清水寺の写真 1/3')
    expect(w.get('[data-testid="photo-counter"]').text()).toBe('1 / 3')

    await w.get('[data-testid="photo-next"]').trigger('click')
    expect(mainSrc(w)).toBe('https://example.com/2.jpg')
    await w.get('[data-testid="photo-next"]').trigger('click')
    await w.get('[data-testid="photo-next"]').trigger('click')
    // 最後の次は、最初に戻る
    expect(mainSrc(w)).toBe('https://example.com/1.jpg')
    await w.get('[data-testid="photo-prev"]').trigger('click')
    expect(mainSrc(w)).toBe('https://example.com/3.jpg')

    await w.findAll('[data-testid="photo-thumb"]')[1]!.trigger('click')
    expect(mainSrc(w)).toBe('https://example.com/2.jpg')
    expect(w.findAll('[data-testid="photo-thumb"]')[1]!.attributes('aria-current')).toBe('true')
  })

  it('写真が減っても、存在しない写真を指さない', async () => {
    const w = wrapper(3)
    await w.get('[data-testid="photo-prev"]').trigger('click') // 3 枚目
    await w.setProps({ photos: photos(1) })
    expect(mainSrc(w)).toBe('https://example.com/1.jpg')
  })
})

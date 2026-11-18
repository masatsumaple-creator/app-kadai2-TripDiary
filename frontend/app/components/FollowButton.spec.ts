import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import FollowButton from './FollowButton.vue'

const button = (props: { following: boolean; pending?: boolean }) => mount(FollowButton, { props }).get('button')

describe('FollowButton', () => {
  it('フォローしていないときは「フォロー」、しているときは「フォロー中」と表示する', () => {
    expect(button({ following: false }).text()).toBe('フォロー')
    expect(button({ following: true }).text()).toBe('フォロー中')
  })

  it('スクリーンリーダーに、切り替えの状態(押されているか)を伝える', () => {
    expect(button({ following: false }).attributes('aria-pressed')).toBe('false')
    expect(button({ following: true }).attributes('aria-pressed')).toBe('true')
  })

  it('押すと toggle を通知する', async () => {
    const wrapper = mount(FollowButton, { props: { following: false } })
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('toggle')).toHaveLength(1)
  })

  it('処理中は押せず、通知もしない(二重送信を防ぐ)', async () => {
    const wrapper = mount(FollowButton, { props: { following: false, pending: true } })
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('toggle')).toBeUndefined()
  })
})

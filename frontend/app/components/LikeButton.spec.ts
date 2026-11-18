import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import LikeButton from './LikeButton.vue'

type Props = { liked: boolean; count: number; pending?: boolean; readonly?: boolean }
const wrapper = (props: Props) => mount(LikeButton, { props })

describe('LikeButton', () => {
  it('件数を表示し、いいね済みかをスクリーンリーダーに伝える', () => {
    const w = wrapper({ liked: true, count: 12 })
    const button = w.get('[data-testid="like-button"]')
    expect(button.text()).toContain('12')
    expect(button.attributes('aria-pressed')).toBe('true')
    expect(button.attributes('aria-label')).toBe('いいね 12 件')
    expect(wrapper({ liked: false, count: 0 }).get('button').attributes('aria-pressed')).toBe('false')
  })

  it('押すと toggle を通知する', async () => {
    const w = wrapper({ liked: false, count: 0 })
    await w.get('button').trigger('click')
    expect(w.emitted('toggle')).toHaveLength(1)
  })

  it('処理中は押せず、通知もしない(二重送信を防ぐ)', async () => {
    const w = wrapper({ liked: false, count: 0, pending: true })
    expect(w.get('button').attributes('disabled')).toBeDefined()
    await w.get('button').trigger('click')
    expect(w.emitted('toggle')).toBeUndefined()
  })

  it('自分の投稿(readonly)では、ボタンではなく件数だけを表示する', () => {
    const w = wrapper({ liked: false, count: 3, readonly: true })
    expect(w.find('button').exists()).toBe(false)
    const count = w.get('[data-testid="like-count"]')
    expect(count.text()).toContain('3')
    expect(count.attributes('aria-label')).toContain('自分の投稿にはいいねできません')
  })
})

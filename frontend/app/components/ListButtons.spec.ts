import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ListButtons from './ListButtons.vue'
import type { ListStatus } from '~/utils/lists'

type Props = { status: ListStatus | null; pending?: boolean; own?: boolean }
const wrapper = (props: Props) => mount(ListButtons, { props })
const find = (w: ReturnType<typeof wrapper>, testid: string) => w.find(`[data-testid="${testid}"]`)

describe('ListButtons', () => {
  it('リストにないときは、「行きたいに追加」と「訪問済みに追加」を出す', async () => {
    const w = wrapper({ status: null })
    expect(find(w, 'list-add-wishlist').text()).toBe('行きたいに追加')
    expect(find(w, 'list-add-visited').text()).toBe('訪問済みに追加')
    expect(find(w, 'list-status').exists()).toBe(false)

    await find(w, 'list-add-wishlist').trigger('click')
    await find(w, 'list-add-visited').trigger('click')
    expect(w.emitted('set')).toEqual([['wishlist'], ['visited']])
  })

  it('「行きたい」のときは、状態を表示し、「訪問済みにする」と「リストから外す」を出す', async () => {
    const w = wrapper({ status: 'wishlist' })
    expect(find(w, 'list-status').text()).toBe('行きたい')
    expect(find(w, 'list-to-wishlist').exists()).toBe(false)
    await find(w, 'list-to-visited').trigger('click')
    expect(w.emitted('set')).toEqual([['visited']])
    await find(w, 'list-remove').trigger('click')
    expect(w.emitted('remove')).toHaveLength(1)
  })

  it('「訪問済み」のときは、状態を表示し、「行きたいに戻す」と「リストから外す」を出す', async () => {
    const w = wrapper({ status: 'visited' })
    expect(find(w, 'list-status').text()).toBe('訪問済み')
    expect(find(w, 'list-to-visited').exists()).toBe(false)
    await find(w, 'list-to-wishlist').trigger('click')
    expect(w.emitted('set')).toEqual([['wishlist']])
  })

  it('自分の投稿は、「訪問済み」の表示だけで、操作のボタンを出さない', () => {
    const w = wrapper({ status: 'visited', own: true })
    expect(find(w, 'list-status').text()).toBe('訪問済み')
    expect(w.findAll('button')).toHaveLength(0)
    expect(w.text()).toContain('自動で訪問済み')
  })

  it('処理中は、すべてのボタンを押せない(二重送信を防ぐ)', async () => {
    for (const status of [null, 'wishlist', 'visited'] as const) {
      const w = wrapper({ status, pending: true })
      const buttons = w.findAll('button')
      expect(buttons.length).toBeGreaterThan(0)
      for (const b of buttons) {
        expect(b.attributes('disabled')).toBeDefined()
        await b.trigger('click')
      }
      expect(w.emitted('set')).toBeUndefined()
      expect(w.emitted('remove')).toBeUndefined()
    }
  })
})

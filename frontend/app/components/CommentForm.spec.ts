import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import CommentForm from './CommentForm.vue'

const mountForm = (modelValue = '', pending = false) =>
  mount(CommentForm, {
    props: {
      modelValue,
      pending,
      // v-model: 入力が変わったら、親の値を更新する
      'onUpdate:modelValue': (v: string) => wrapperRef.setProps({ modelValue: v }),
    },
  })
let wrapperRef: ReturnType<typeof mountForm>

const make = (modelValue = '', pending = false) => {
  wrapperRef = mountForm(modelValue, pending)
  return wrapperRef
}
const submitButton = (w: ReturnType<typeof make>) => w.get('[data-testid="comment-submit"]')

describe('CommentForm', () => {
  it('空のときは送信できない', () => {
    expect(submitButton(make('')).attributes('disabled')).toBeDefined()
  })

  it('空白だけのときも送信できない', () => {
    expect(submitButton(make('   \n  ')).attributes('disabled')).toBeDefined()
  })

  it('入力すると、送信できるようになり、文字数が表示される', async () => {
    const w = make('')
    await w.get('textarea').setValue('いい場所でした')
    expect(submitButton(w).attributes('disabled')).toBeUndefined()
    expect(w.get('[data-testid="comment-counter"]').text()).toBe('7 / 500')
  })

  it('入力欄は 500 文字までに制限する', () => {
    expect(make('').get('textarea').attributes('maxlength')).toBe('500')
  })

  it('送信すると submit を通知する。内容が無効なときは通知しない', async () => {
    const ok = make('こんにちは')
    await ok.get('form').trigger('submit')
    expect(ok.emitted('submit')).toHaveLength(1)

    const blank = make('  ')
    await blank.get('form').trigger('submit')
    expect(blank.emitted('submit')).toBeUndefined()
  })

  it('送信中は押せず、「送信中…」と表示する', () => {
    const w = make('こんにちは', true)
    expect(submitButton(w).attributes('disabled')).toBeDefined()
    expect(submitButton(w).text()).toBe('送信中…')
  })
})

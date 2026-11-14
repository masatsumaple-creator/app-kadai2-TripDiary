import { useAuthStore } from '~/stores/auth'

// 起動時にセッションを復元してから画面を表示する(ログイン済みなのに一瞬ログイン画面に飛ぶのを防ぐ)
export default defineNuxtPlugin(async () => {
  await useAuthStore().restore()
})

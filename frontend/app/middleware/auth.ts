import { useAuthStore } from '~/stores/auth'

// ログインが必要な画面用。未ログインならログイン画面へ移動し、ログイン後に元の画面へ戻す
export default defineNuxtRouteMiddleware((to) => {
  if (!useAuthStore().isLoggedIn) {
    return navigateTo({ path: '/login', query: { redirect: to.fullPath } })
  }
})

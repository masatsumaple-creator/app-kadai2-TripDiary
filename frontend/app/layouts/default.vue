<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'

const route = useRoute()
const auth = useAuthStore()
const { hideMock } = useRuntimeConfig().public
const nav = [
  { to: '/', label: '新着', icon: '🏠' },
  { to: '/following', label: 'フォロー中', icon: '👥' },
  // 地図はダミーのため、本番(HIDE_MOCK=true)では出さない
  ...(hideMock ? [] : [{ to: '/map', label: '地図', icon: '🗺️' }]),
]
// スマホの下部タブにのみ出す項目(PC ではヘッダーに表示)
const mobileOnly = computed(() => [
  { to: '/me/list', label: 'マイリスト', icon: '🔖' },
  { to: `/users/${auth.user?.id}`, label: 'プロフィール', icon: '👤' },
])
const isActive = (to: string) => (to === '/' ? route.path === '/' : route.path.startsWith(to))

// ログイン済みのときだけ、マイリスト・プロフィールを下部タブに出す
const tabs = computed(() => (auth.isLoggedIn ? [...nav, ...mobileOnly.value] : nav))

async function logout() {
  await auth.logout()
  await navigateTo('/')
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 pb-16 text-gray-900 md:pb-0">
    <header class="sticky top-0 z-10 border-b border-gray-200 bg-white">
      <div class="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
        <NuxtLink to="/" class="text-lg font-bold">TripDiary</NuxtLink>
        <nav class="hidden gap-4 text-sm md:flex">
          <NuxtLink
            v-for="n in nav"
            :key="n.to"
            :to="n.to"
            :class="isActive(n.to) ? 'font-semibold text-sky-700' : 'text-gray-600'"
          >
            {{ n.label }}
          </NuxtLink>
        </nav>
        <div class="ml-auto flex items-center gap-3 text-sm">
          <template v-if="auth.user">
            <NuxtLink to="/me/list" class="hidden text-gray-600 md:inline">マイリスト</NuxtLink>
            <NuxtLink :to="`/users/${auth.user.id}`" class="hidden text-gray-600 md:inline">
              プロフィール
            </NuxtLink>
            <span class="hidden max-w-24 truncate text-gray-500 md:inline" data-testid="user-name">
              {{ auth.user.name }}
            </span>
            <button type="button" class="text-gray-600" data-testid="logout" @click="logout">ログアウト</button>
            <NuxtLink to="/spots/new" class="rounded bg-sky-700 px-3 py-1.5 text-white hover:bg-sky-800">
              投稿する
            </NuxtLink>
          </template>
          <NuxtLink v-else to="/login" class="rounded bg-sky-700 px-3 py-1.5 text-white hover:bg-sky-800">
            ログイン
          </NuxtLink>
        </div>
      </div>
    </header>
    <main class="mx-auto max-w-5xl p-4">
      <slot />
    </main>
    <nav class="fixed inset-x-0 bottom-0 flex border-t border-gray-200 bg-white md:hidden">
      <NuxtLink
        v-for="n in tabs"
        :key="n.to"
        :to="n.to"
        class="flex flex-1 flex-col items-center py-2 text-xs"
        :class="isActive(n.to) ? 'font-semibold text-sky-700' : 'text-gray-600'"
      >
        <span aria-hidden="true">{{ n.icon }}</span>
        {{ n.label }}
      </NuxtLink>
    </nav>
  </div>
</template>

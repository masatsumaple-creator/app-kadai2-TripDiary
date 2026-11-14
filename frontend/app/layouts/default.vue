<script setup lang="ts">
const route = useRoute()
const nav = [
  { to: '/', label: '新着', icon: '🏠' },
  { to: '/following', label: 'フォロー中', icon: '👥' },
  { to: '/map', label: '地図', icon: '🗺️' },
]
// スマホの下部タブにのみ出す項目(PC ではヘッダーに表示)
const mobileOnly = [
  { to: '/me/list', label: 'マイリスト', icon: '🔖' },
  { to: '/users/5', label: 'プロフィール', icon: '👤' },
]
const isActive = (to: string) => (to === '/' ? route.path === '/' : route.path.startsWith(to))
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
          <NuxtLink to="/me/list" class="hidden text-gray-600 md:inline">マイリスト</NuxtLink>
          <NuxtLink to="/users/5" class="hidden text-gray-600 md:inline">プロフィール</NuxtLink>
          <NuxtLink to="/login" class="text-gray-600">ログイン</NuxtLink>
          <NuxtLink to="/spots/new" class="rounded bg-sky-600 px-3 py-1.5 text-white hover:bg-sky-700">
            投稿する
          </NuxtLink>
        </div>
      </div>
    </header>
    <main class="mx-auto max-w-5xl p-4">
      <slot />
    </main>
    <nav class="fixed inset-x-0 bottom-0 flex border-t border-gray-200 bg-white md:hidden">
      <NuxtLink
        v-for="n in [...nav, ...mobileOnly]"
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

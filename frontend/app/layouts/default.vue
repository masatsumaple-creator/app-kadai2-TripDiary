<script setup lang="ts">
const route = useRoute()
const nav = [
  { to: '/', label: '新着', icon: '🏠' },
  { to: '/following', label: 'フォロー中', icon: '👥' },
  { to: '/map', label: '地図', icon: '🗺️' },
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
        <NuxtLink to="/spots/new" class="ml-auto rounded bg-sky-600 px-3 py-1.5 text-sm text-white hover:bg-sky-700">
          投稿する
        </NuxtLink>
      </div>
    </header>
    <main class="mx-auto max-w-5xl p-4">
      <slot />
    </main>
    <nav class="fixed inset-x-0 bottom-0 flex border-t border-gray-200 bg-white md:hidden">
      <NuxtLink
        v-for="n in nav"
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

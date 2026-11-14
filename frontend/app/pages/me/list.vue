<script setup lang="ts">
import { findSpot } from '~/utils/mockData'

// モック: 自分の投稿(江ノ島)は自動で訪問済み
const tab = ref<'visited' | 'want'>('visited')
const visited = ref([6, 1].map((id) => findSpot(id)!))
const want = ref([2, 5].map((id) => findSpot(id)!))
const items = computed(() => (tab.value === 'visited' ? visited.value : want.value))

function markVisited(id: number) {
  const s = want.value.find((x) => x.id === id)
  if (!s) return
  want.value = want.value.filter((x) => x.id !== id)
  visited.value.push(s)
}
function remove(id: number) {
  want.value = want.value.filter((x) => x.id !== id)
}
</script>

<template>
  <section class="space-y-4">
    <h1 class="text-xl font-bold">マイリスト</h1>
    <div class="flex border-b border-gray-200 text-sm">
      <button
        v-for="t in [
          { v: 'visited', l: `訪問済み(${visited.length})` },
          { v: 'want', l: `行きたい(${want.length})` },
        ] as const"
        :key="t.v"
        type="button"
        class="flex-1 py-2"
        :class="tab === t.v ? 'border-b-2 border-sky-600 font-semibold text-sky-700' : 'text-gray-500'"
        @click="tab = t.v"
      >
        {{ t.l }}
      </button>
    </div>
    <p v-if="!items.length" class="py-12 text-center text-gray-500">まだスポットがありません。</p>
    <ul class="space-y-2">
      <li v-for="s in items" :key="s.id" class="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3">
        <NuxtLink :to="`/spots/${s.id}`" class="flex-1">
          <p class="font-semibold">{{ s.name }}</p>
          <p class="text-xs text-gray-500">{{ s.areas.join('、') }}</p>
        </NuxtLink>
        <template v-if="tab === 'want'">
          <button type="button" class="rounded border border-gray-300 px-2 py-1 text-xs" @click="markVisited(s.id)">
            訪問済みにする
          </button>
          <button type="button" class="text-xs text-red-600" @click="remove(s.id)">削除</button>
        </template>
      </li>
    </ul>
  </section>
</template>

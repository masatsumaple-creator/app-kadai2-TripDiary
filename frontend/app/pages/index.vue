<script setup lang="ts">
import { mockSpots } from '~/utils/mockData'

const area = ref('')
// モック: 公開と自分の投稿を表示(フォロワー限定はフォロー中でのみ見える想定)
const spots = computed(() =>
  mockSpots.filter((s) => s.visibility !== 'followers' && (!area.value || s.areas.includes(area.value))),
)
</script>

<template>
  <section class="space-y-4">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-bold">新着</h1>
      <AreaFilter v-model="area" />
    </div>
    <p v-if="!spots.length" class="py-12 text-center text-gray-500">該当する投稿がありません。</p>
    <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <SpotCard v-for="s in spots" :key="s.id" :spot="s" />
    </div>
    <div class="text-center">
      <button class="rounded border border-gray-300 bg-white px-4 py-2 text-sm text-gray-600" type="button">
        もっと見る
      </button>
    </div>
  </section>
</template>

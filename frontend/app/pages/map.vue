<script setup lang="ts">
import { findSpot, mockSpots } from '~/utils/mockData'

const area = ref('')

useHead({ title: '地図' })
const selectedId = ref<number>()
const spots = computed(() =>
  mockSpots.filter((s) => s.visibility === 'public' && (!area.value || s.areas.includes(area.value))),
)
const selected = computed(() => (selectedId.value ? findSpot(selectedId.value) : undefined))
</script>

<template>
  <section class="space-y-4">
    <MockNotice />
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-bold">地図</h1>
      <AreaFilter v-model="area" />
    </div>
    <SpotMap :spots="spots" :selected-id="selectedId" class="h-[60vh]" @select="selectedId = $event" />
    <NuxtLink
      v-if="selected"
      :to="`/mock/spots/${selected.id}`"
      class="block rounded-lg border border-gray-200 bg-white p-3"
      data-testid="map-summary"
    >
      <p class="font-semibold">{{ selected.name }}</p>
      <p class="text-sm text-gray-600">{{ selected.address }}</p>
      <p class="mt-1 text-xs text-sky-700">詳細を見る →</p>
    </NuxtLink>
    <p v-else class="text-center text-sm text-gray-500">ピンを選ぶと概要が表示されます。</p>
  </section>
</template>

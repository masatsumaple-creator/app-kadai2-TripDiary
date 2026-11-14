<script setup lang="ts">
import type { MockSpot } from '~/utils/mockData'
import { visibilityLabels } from '~/utils/mockData'

defineProps<{ spot: MockSpot }>()
</script>

<template>
  <NuxtLink
    :to="`/spots/${spot.id}`"
    class="block overflow-hidden rounded-lg border border-gray-200 bg-white transition hover:shadow-md"
    data-testid="spot-card"
  >
    <div
      class="flex h-40 items-center justify-center text-sm text-white/80"
      :style="{ background: `linear-gradient(135deg, hsl(${spot.hue} 60% 55%), hsl(${spot.hue + 40} 60% 35%))` }"
    >
      写真 {{ spot.photoCount }} 枚
    </div>
    <div class="space-y-1 p-3">
      <h3 class="font-semibold">{{ spot.name }}</h3>
      <p class="flex flex-wrap gap-1 text-xs">
        <span v-for="a in spot.areas" :key="a" class="rounded bg-sky-100 px-2 py-0.5 text-sky-800">{{ a }}</span>
        <span v-if="spot.visibility !== 'public'" class="rounded bg-amber-100 px-2 py-0.5 text-amber-800">
          {{ visibilityLabels[spot.visibility] }}
        </span>
      </p>
      <p class="flex justify-between text-xs text-gray-500">
        <span>{{ spot.author }}</span>
        <span>♥ {{ spot.likes }}</span>
      </p>
    </div>
  </NuxtLink>
</template>

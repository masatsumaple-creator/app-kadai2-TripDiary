<script setup lang="ts">
import type { MapPoint } from '~/utils/spots'

// モック用のダミー地図。緯度経度を日本周辺の範囲に割り付けてピンを置く
const props = defineProps<{ spots: MapPoint[]; selectedId?: number }>()
const emit = defineEmits<{ select: [id: number] }>()

const BOUNDS = { latMin: 24, latMax: 46, lngMin: 122, lngMax: 147 }
const single = computed(() => props.spots.length === 1)

function pos(s: MapPoint) {
  if (single.value) return { left: '50%', top: '50%' }
  const x = (s.lng - BOUNDS.lngMin) / (BOUNDS.lngMax - BOUNDS.lngMin)
  const y = 1 - (s.lat - BOUNDS.latMin) / (BOUNDS.latMax - BOUNDS.latMin)
  return { left: `${x * 100}%`, top: `${y * 100}%` }
}
</script>

<template>
  <div
    class="relative overflow-hidden rounded-lg border border-gray-200 bg-sky-50"
    style="
      background-image: linear-gradient(#e0f2fe 1px, transparent 1px), linear-gradient(90deg, #e0f2fe 1px, transparent 1px);
      background-size: 32px 32px;
    "
    role="group"
    aria-label="地図(モック)"
  >
    <span class="absolute right-2 top-2 rounded bg-white/80 px-2 py-0.5 text-xs text-gray-500">ダミー地図</span>
    <button
      v-for="s in spots"
      :key="s.id"
      type="button"
      class="absolute -translate-x-1/2 -translate-y-full text-2xl"
      :class="selectedId === s.id ? 'z-10 scale-125' : ''"
      :style="pos(s)"
      :aria-label="s.name"
      data-testid="map-pin"
      @click="emit('select', s.id)"
    >
      📍
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { SpotPhoto } from '~/utils/photos'

// 詳細の写真。大きく 1 枚を表示し、複数枚のときは、サムネイルと前後のボタンで切り替える
const props = defineProps<{ photos: SpotPhoto[]; name: string }>()

const index = ref(0)
// 写真が減ったとき(別の投稿への移動を含む)、範囲外を指さない
watch(
  () => props.photos.length,
  (n) => {
    if (index.value >= n) index.value = Math.max(0, n - 1)
  },
)
const current = computed(() => props.photos[index.value])
const total = computed(() => props.photos.length)

const go = (i: number) => {
  index.value = (i + total.value) % total.value
}
</script>

<template>
  <section
    v-if="current"
    class="space-y-2"
    aria-label="写真"
    data-testid="spot-photos"
  >
    <div class="relative overflow-hidden rounded-lg bg-gray-100">
      <img
        :key="current.id"
        :src="current.url"
        :alt="`${name}の写真 ${index + 1}/${total}`"
        class="max-h-[28rem] w-full object-contain"
        data-testid="spot-photo-main"
      >
      <template v-if="total > 1">
        <button
          type="button"
          class="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 px-3 py-2 text-white"
          aria-label="前の写真"
          data-testid="photo-prev"
          @click="go(index - 1)"
        >
          ‹
        </button>
        <button
          type="button"
          class="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 px-3 py-2 text-white"
          aria-label="次の写真"
          data-testid="photo-next"
          @click="go(index + 1)"
        >
          ›
        </button>
        <p
          class="absolute bottom-2 right-2 rounded bg-black/50 px-2 py-0.5 text-xs text-white"
          data-testid="photo-counter"
        >
          {{ index + 1 }} / {{ total }}
        </p>
      </template>
    </div>
    <ul v-if="total > 1" class="flex flex-wrap gap-2">
      <li v-for="(p, i) in photos" :key="p.id">
        <button
          type="button"
          class="block overflow-hidden rounded border-2"
          :class="i === index ? 'border-sky-600' : 'border-transparent'"
          :aria-label="`${i + 1} 枚目の写真を表示`"
          :aria-current="i === index ? 'true' : undefined"
          data-testid="photo-thumb"
          @click="index = i"
        >
          <img :src="p.url" alt="" class="h-14 w-14 object-cover">
        </button>
      </li>
    </ul>
  </section>
</template>

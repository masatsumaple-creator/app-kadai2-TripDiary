<script setup lang="ts">
import { computed } from 'vue'
import { visibilityLabels } from '~/utils/spotMeta'
import { hueOf, type CardSpot } from '~/utils/spots'

// mock: モック画面のカード。ダミーデータの詳細(/mock/spots/:id)へ移動する
const props = defineProps<{ spot: CardSpot; mock?: boolean }>()
const to = computed(() => `${props.mock ? '/mock' : ''}/spots/${props.spot.id}`)
const hue = computed(() => props.spot.hue ?? hueOf(props.spot.id))
</script>

<template>
  <NuxtLink
    :to="to"
    class="block overflow-hidden rounded-lg border border-gray-200 bg-white transition hover:shadow-md"
    data-testid="spot-card"
  >
    <!-- 写真があれば代表の写真、なければ色のグラデーション -->
    <img
      v-if="spot.coverPhotoUrl"
      :src="spot.coverPhotoUrl"
      :alt="`${spot.name}の写真`"
      loading="lazy"
      class="h-40 w-full object-cover"
      data-testid="spot-card-photo"
    >
    <div
      v-else
      class="flex h-40 items-center justify-center text-sm text-white/80"
      :style="{
        background: `linear-gradient(135deg, hsl(${hue} 60% 55%), hsl(${hue + 40} 60% 35%))`,
      }"
    >
      <template v-if="spot.photoCount !== undefined"
        >写真 {{ spot.photoCount }} 枚</template
      >
    </div>
    <div class="space-y-1 p-3">
      <h3 class="font-semibold">{{ spot.name }}</h3>
      <p class="flex flex-wrap gap-1 text-xs">
        <span
          v-for="a in spot.areas"
          :key="a"
          class="rounded bg-sky-100 px-2 py-0.5 text-sky-800"
          >{{ a }}</span
        >
        <span
          v-if="spot.visibility !== 'public'"
          class="rounded bg-amber-100 px-2 py-0.5 text-amber-800"
        >
          {{ visibilityLabels[spot.visibility] }}
        </span>
      </p>
      <p class="flex justify-between text-xs text-gray-500">
        <span>{{ spot.authorName }}</span>
        <span v-if="spot.likes !== undefined">♥ {{ spot.likes }}</span>
      </p>
    </div>
  </NuxtLink>
</template>

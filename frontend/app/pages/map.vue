<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ApiError } from '~/utils/api'
import { parseMapView, type Bounds } from '~/utils/map'
import { visibilityLabels } from '~/utils/spotMeta'
import type { MapSpotItem } from '~/utils/spots'

useHead({ title: '地図' })

const api = useSpotsApi()
const route = useRoute()

// ?lat=…&lng=…&zoom=… で、表示の位置を指定できる(共有・テスト用)。なければ、日本全体
const view = parseMapView(route.query)

const area = ref('')
const spots = ref<MapSpotItem[]>([])
const truncated = ref(false)
const selectedId = ref<number>()
const loading = ref(false)
const error = ref('')

let bounds: Bounds | undefined
let seq = 0
let timer: ReturnType<typeof setTimeout> | undefined

// 地図を動かしている間に、何度も問い合わせない(止まってから)。遅れて届いた古い応答は、捨てる
async function load() {
  if (!bounds) return
  const mine = ++seq
  loading.value = true
  error.value = ''
  try {
    const res = await api.inBounds(bounds, area.value || undefined)
    if (mine !== seq) return
    spots.value = res.items
    truncated.value = res.truncated
    // 範囲から外れて消えたピンが、選ばれたままにならないように
    if (selectedId.value && !res.items.some((s) => s.id === selectedId.value)) selectedId.value = undefined
  } catch (e) {
    if (mine !== seq) return
    error.value = e instanceof ApiError ? e.message : 'スポットを取得できませんでした。'
  } finally {
    if (mine === seq) loading.value = false
  }
}

function onBounds(b: Bounds) {
  bounds = b
  clearTimeout(timer)
  timer = setTimeout(load, 300)
}

watch(area, () => {
  selectedId.value = undefined
  void load()
})
onBeforeUnmount(() => clearTimeout(timer))

const markers = computed(() => spots.value.map((s) => ({ id: s.id, name: s.name, lat: s.latitude, lng: s.longitude })))
const selected = computed(() => spots.value.find((s) => s.id === selectedId.value))
</script>

<template>
  <section class="space-y-4">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-bold">地図</h1>
      <AreaFilter v-model="area" />
    </div>

    <SpotMap
      :markers="markers"
      :selected-id="selectedId"
      :view="view"
      label="スポットの地図"
      class="h-[60vh]"
      @select="selectedId = $event"
      @bounds="onBounds"
    />

    <p v-if="error" class="rounded bg-red-50 p-3 text-sm text-red-700" role="alert">{{ error }}</p>
    <p
      v-if="truncated"
      class="rounded bg-amber-50 p-3 text-sm text-amber-800"
      role="status"
      data-testid="map-truncated"
    >
      この範囲には、表示しきれないスポットがあります(新しい 100 件を表示しています)。地図を拡大すると、絞り込めます。
    </p>

    <NuxtLink
      v-if="selected"
      :to="`/spots/${selected.id}`"
      class="block rounded-lg border border-gray-200 bg-white p-3"
      data-testid="map-summary"
    >
      <p class="font-semibold">{{ selected.name }}</p>
      <p class="flex flex-wrap gap-1 text-xs">
        <span v-for="a in selected.areas" :key="a" class="rounded bg-sky-100 px-2 py-0.5 text-sky-800">{{ a }}</span>
        <span v-if="selected.visibility !== 'public'" class="rounded bg-amber-100 px-2 py-0.5 text-amber-800">
          {{ visibilityLabels[selected.visibility] }}
        </span>
      </p>
      <p class="mt-1 text-xs text-sky-700">詳細を見る →</p>
    </NuxtLink>
    <p v-else class="text-center text-sm text-gray-500" data-testid="map-hint">
      {{ loading ? '読み込み中…' : spots.length === 0 ? 'この範囲には、表示できるスポットがありません。' : 'ピンを選ぶと概要が表示されます。' }}
    </p>
  </section>
</template>

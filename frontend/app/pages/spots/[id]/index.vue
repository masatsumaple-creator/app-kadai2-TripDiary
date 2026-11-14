<script setup lang="ts">
import { ApiError } from '~/utils/api'
import { visibilityLabels } from '~/utils/spotMeta'
import {
  mergeNearby,
  toCardSpot,
  type Spot,
  type SpotListItem,
} from '~/utils/spots'

const api = useSpotsApi()
const route = useRoute()
const id = computed(() => Number(route.params.id))

const spot = ref<Spot | null>(null)
const nearby = ref<SpotListItem[]>([])
const loading = ref(true)
const notFound = ref(false)
const error = ref('')
const deleting = ref(false)

async function loadNearby(s: Spot) {
  try {
    // 同じエリアタグの他の投稿(要件定義書の「近くのスポット」)。失敗しても詳細は表示する
    const lists = await Promise.all(
      s.areas.map((area) => api.list({ area, limit: 6 })),
    )
    nearby.value = mergeNearby(
      lists.map((l) => l.items),
      s.id,
    )
  } catch {
    nearby.value = []
  }
}

async function load() {
  loading.value = true
  notFound.value = false
  error.value = ''
  spot.value = null
  nearby.value = []
  try {
    spot.value = await api.get(id.value)
    void loadNearby(spot.value)
  } catch (e) {
    // 閲覧できない投稿も 404 で返ってくる(存在を知らせない仕様)
    if (e instanceof ApiError && e.status === 404) notFound.value = true
    else
      error.value =
        e instanceof ApiError ? e.message : '投稿を取得できませんでした。'
  } finally {
    loading.value = false
  }
}

async function remove() {
  if (!spot.value || !window.confirm('この投稿を削除しますか?元に戻せません。'))
    return
  deleting.value = true
  error.value = ''
  try {
    await api.remove(spot.value.id)
    await navigateTo('/')
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '削除できませんでした。'
  } finally {
    deleting.value = false
  }
}

const date = (iso: string) => new Date(iso).toLocaleDateString('ja-JP')

// 別の投稿への移動(近くのスポットなど)でも読み込み直す
watch(id, load, { immediate: true })
</script>

<template>
  <div class="space-y-4">
    <NuxtLink to="/" class="text-sm text-sky-700">← 一覧へ</NuxtLink>

    <p v-if="loading" class="py-12 text-center text-gray-500">読み込み中…</p>
    <p
      v-else-if="notFound"
      class="py-12 text-center text-gray-500"
      data-testid="not-found"
    >
      投稿が見つかりません。削除されたか、閲覧できない投稿です。
    </p>
    <p
      v-else-if="error && !spot"
      class="rounded bg-red-50 p-3 text-sm text-red-700"
      role="alert"
    >
      {{ error }}
      <button type="button" class="ml-2 underline" @click="load">
        再読み込み
      </button>
    </p>

    <article v-else-if="spot" class="space-y-4">
      <div>
        <h1 class="text-2xl font-bold" data-testid="spot-name">
          {{ spot.name }}
        </h1>
        <p class="mt-1 flex flex-wrap gap-1 text-xs">
          <span
            v-for="a in spot.areas"
            :key="a"
            class="rounded bg-sky-100 px-2 py-0.5 text-sky-800"
            >{{ a }}</span
          >
          <span class="rounded bg-amber-100 px-2 py-0.5 text-amber-800">{{
            visibilityLabels[spot.visibility]
          }}</span>
        </p>
        <p class="mt-1 text-sm text-gray-500">
          投稿者: {{ spot.author.name }} ・ {{ date(spot.createdAt) }}
        </p>
      </div>

      <p
        v-if="spot.review"
        class="whitespace-pre-wrap"
        data-testid="spot-review"
      >
        {{ spot.review }}
      </p>
      <p v-if="spot.address" class="text-sm text-gray-600">
        📍 {{ spot.address }}
      </p>
      <SpotMap
        v-if="spot.latitude !== null && spot.longitude !== null"
        :spots="[
          {
            id: spot.id,
            name: spot.name,
            lat: spot.latitude,
            lng: spot.longitude,
          },
        ]"
        class="h-48"
      />

      <p
        v-if="error"
        class="rounded bg-red-50 p-3 text-sm text-red-700"
        role="alert"
      >
        {{ error }}
      </p>
      <div v-if="spot.isMine" class="flex gap-2">
        <NuxtLink
          :to="`/spots/${spot.id}/edit`"
          class="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm"
          data-testid="edit"
        >
          編集
        </NuxtLink>
        <button
          type="button"
          class="rounded border border-red-300 bg-white px-3 py-1.5 text-sm text-red-700 disabled:opacity-50"
          :disabled="deleting"
          data-testid="delete"
          @click="remove"
        >
          削除
        </button>
      </div>

      <section
        v-if="nearby.length"
        class="space-y-3 border-t border-gray-200 pt-4"
        data-testid="nearby"
      >
        <h2 class="font-semibold">近くのスポット</h2>
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SpotCard v-for="s in nearby" :key="s.id" :spot="toCardSpot(s)" />
        </div>
      </section>
    </article>
  </div>
</template>

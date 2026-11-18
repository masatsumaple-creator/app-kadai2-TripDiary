<script setup lang="ts">
import { ApiError } from '~/utils/api'
import { toCardSpot, type SpotListItem } from '~/utils/spots'

const api = useSpotsApi()

useHead({ title: '新着' })
const area = ref('')
const items = ref<SpotListItem[]>([])
const nextCursor = ref<number | null>(null)
const loading = ref(true)
const loadingMore = ref(false)
const error = ref('')

// 絞り込みを素早く切り替えたとき、遅れて届いた古い応答で一覧を上書きしないようにする
let seq = 0

async function load(more: boolean) {
  const mine = ++seq
  error.value = ''
  if (more) loadingMore.value = true
  else loading.value = true
  try {
    const res = await api.list({
      area: area.value,
      cursor: more ? nextCursor.value : null,
    })
    if (mine !== seq) return
    items.value = more ? [...items.value, ...res.items] : res.items
    nextCursor.value = res.nextCursor
  } catch (e) {
    if (mine !== seq) return
    error.value =
      e instanceof ApiError ? e.message : '一覧を取得できませんでした。'
  } finally {
    if (mine === seq) {
      loading.value = false
      loadingMore.value = false
    }
  }
}

watch(area, () => load(false), { immediate: true })
</script>

<template>
  <section class="space-y-4">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-bold">新着</h1>
      <AreaFilter v-model="area" />
    </div>

    <p
      v-if="error"
      class="rounded bg-red-50 p-3 text-sm text-red-700"
      role="alert"
      data-testid="list-error"
    >
      {{ error }}
      <button type="button" class="ml-2 underline" @click="load(false)">
        再読み込み
      </button>
    </p>
    <p v-if="loading" class="py-12 text-center text-gray-500">読み込み中…</p>
    <p
      v-else-if="!items.length && !error"
      class="py-12 text-center text-gray-500"
      data-testid="list-empty"
    >
      該当する投稿がありません。
    </p>
    <div
      v-else-if="items.length"
      class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      <SpotCard v-for="s in items" :key="s.id" :spot="toCardSpot(s)" />
    </div>

    <div v-if="nextCursor && !loading" class="text-center">
      <button
        class="rounded border border-gray-300 bg-white px-4 py-2 text-sm text-gray-600 disabled:opacity-50"
        type="button"
        :disabled="loadingMore"
        data-testid="load-more"
        @click="load(true)"
      >
        {{ loadingMore ? '読み込み中…' : 'もっと見る' }}
      </button>
    </div>
  </section>
</template>

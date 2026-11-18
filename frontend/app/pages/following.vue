<script setup lang="ts">
import { ApiError } from '~/utils/api'
import { toCardSpot, type SpotListItem } from '~/utils/spots'

definePageMeta({ middleware: 'auth' })

useHead({ title: 'フォロー中' })

const api = useSpotsApi()
const items = ref<SpotListItem[]>([])
const nextCursor = ref<number | null>(null)
const loading = ref(true)
const loadingMore = ref(false)
const error = ref('')

async function load(more: boolean) {
  error.value = ''
  if (more) loadingMore.value = true
  else loading.value = true
  try {
    // フォローしている人の、見られる投稿だけ(新着順)
    const res = await api.list({
      following: true,
      cursor: more ? nextCursor.value : null,
    })
    items.value = more ? [...items.value, ...res.items] : res.items
    nextCursor.value = res.nextCursor
  } catch (e) {
    error.value =
      e instanceof ApiError ? e.message : '一覧を取得できませんでした。'
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

load(false)
</script>

<template>
  <section class="space-y-4">
    <h1 class="text-xl font-bold">フォロー中</h1>

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
    <div
      v-else-if="!items.length && !error"
      class="space-y-2 py-12 text-center text-gray-500"
      data-testid="list-empty"
    >
      <p>フォロー中のユーザーの投稿はまだありません。</p>
      <p class="text-sm">
        <NuxtLink to="/" class="text-sky-700 underline">新着</NuxtLink>
        から、気になるユーザーのプロフィールを開いて、フォローしてみましょう。
      </p>
    </div>
    <div
      v-else-if="items.length"
      class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      <SpotCard v-for="s in items" :key="s.id" :spot="toCardSpot(s)" />
    </div>

    <div v-if="nextCursor && !loading" class="text-center">
      <button
        type="button"
        class="rounded border border-gray-300 bg-white px-4 py-2 text-sm text-gray-600 disabled:opacity-50"
        :disabled="loadingMore"
        data-testid="load-more"
        @click="load(true)"
      >
        {{ loadingMore ? '読み込み中…' : 'もっと見る' }}
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ApiError } from '~/utils/api'
import {
  listStatusLabels,
  type ListCounts,
  type ListStatus,
} from '~/utils/lists'
import type { SpotListItem } from '~/utils/spots'

definePageMeta({ middleware: 'auth' })

useHead({ title: 'マイリスト' })

const api = useListsApi()

const tab = ref<ListStatus>('visited')
const items = ref<SpotListItem[]>([])
const nextCursor = ref<number | null>(null)
const counts = ref<ListCounts>({ visited: 0, wishlist: 0 })
const loading = ref(true)
const loadingMore = ref(false)
const error = ref('')
// 操作中の投稿の ID(その行のボタンだけ無効にする)
const busyId = ref<number | null>(null)

// タブを素早く切り替えたとき、遅れて届いた古い応答で一覧を上書きしない
let seq = 0

async function load(more: boolean) {
  const mine = ++seq
  error.value = ''
  if (more) loadingMore.value = true
  else loading.value = true
  try {
    const res = await api.list(tab.value, more ? nextCursor.value : null)
    if (mine !== seq) return
    items.value = more ? [...items.value, ...res.items] : res.items
    nextCursor.value = res.nextCursor
    counts.value = res.counts
  } catch (e) {
    if (mine !== seq) return
    error.value =
      e instanceof ApiError ? e.message : 'マイリストを取得できませんでした。'
  } finally {
    if (mine === seq) {
      loading.value = false
      loadingMore.value = false
    }
  }
}

// 状態の変更・削除。成功したら、この一覧から外し(別の状態のタブに移る、またはリストから消える)、件数を取り直す
async function change(
  item: SpotListItem,
  action: () => Promise<unknown>,
  fallback: string,
) {
  busyId.value = item.id
  error.value = ''
  try {
    await action()
    items.value = items.value.filter((i) => i.id !== item.id)
    await refreshCounts()
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : fallback
  } finally {
    busyId.value = null
  }
}

// 件数だけを取り直す(一覧の表示は変えない)
async function refreshCounts() {
  try {
    counts.value = (await api.list(tab.value)).counts
  } catch {
    // 件数の更新に失敗しても、操作自体は成功しているので、画面はそのままにする
  }
}

const moveTo = (item: SpotListItem, status: ListStatus) =>
  change(
    item,
    () => api.set(item.id, status),
    'マイリストの操作に失敗しました。',
  )
const removeItem = (item: SpotListItem) =>
  change(item, () => api.remove(item.id), 'リストから外せませんでした。')

watch(tab, () => load(false), { immediate: true })

const tabs: { status: ListStatus; label: string }[] = [
  { status: 'visited', label: listStatusLabels.visited },
  { status: 'wishlist', label: listStatusLabels.wishlist },
]
</script>

<template>
  <section class="space-y-4">
    <h1 class="text-xl font-bold">マイリスト</h1>

    <div class="flex border-b border-gray-200 text-sm" role="tablist">
      <button
        v-for="t in tabs"
        :key="t.status"
        type="button"
        role="tab"
        class="flex-1 py-2"
        :class="
          tab === t.status
            ? 'border-b-2 border-sky-700 font-semibold text-sky-700'
            : 'text-gray-600'
        "
        :aria-selected="tab === t.status"
        :data-testid="`tab-${t.status}`"
        @click="tab = t.status"
      >
        {{ t.label }}(<span :data-testid="`count-${t.status}`">{{
          counts[t.status]
        }}</span
        >)
      </button>
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
    <div
      v-else-if="!items.length && !error"
      class="space-y-2 py-12 text-center text-gray-500"
      data-testid="list-empty"
    >
      <p v-if="tab === 'visited'">訪問済みのスポットはまだありません。</p>
      <p v-else>行きたいスポットはまだありません。</p>
      <p class="text-sm">
        <NuxtLink to="/" class="text-sky-700 underline">新着</NuxtLink>
        から、気になるスポットを探して、詳細から追加しましょう。
      </p>
    </div>
    <ul v-else-if="items.length" class="space-y-2">
      <li
        v-for="s in items"
        :key="s.id"
        class="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-3"
        data-testid="list-item"
      >
        <NuxtLink
          :to="`/spots/${s.id}`"
          class="min-w-0 flex-1"
          data-testid="list-item-link"
        >
          <p class="truncate font-semibold">{{ s.name }}</p>
          <p class="text-xs text-gray-600">
            {{ s.areas.join('、') }} ・ {{ s.author.name }}
          </p>
        </NuxtLink>
        <!-- 自分の投稿は、自動で訪問済みで、変更も削除もできないため、ボタンを出さない -->
        <span
          v-if="s.isMine"
          class="text-xs text-gray-600"
          data-testid="list-item-own"
          >自分の投稿</span
        >
        <template v-else>
          <button
            v-if="tab === 'wishlist'"
            type="button"
            class="rounded border border-gray-300 px-2 py-1 text-xs disabled:opacity-50"
            :disabled="busyId === s.id"
            data-testid="item-to-visited"
            @click="moveTo(s, 'visited')"
          >
            訪問済みにする
          </button>
          <button
            v-else
            type="button"
            class="rounded border border-gray-300 px-2 py-1 text-xs disabled:opacity-50"
            :disabled="busyId === s.id"
            data-testid="item-to-wishlist"
            @click="moveTo(s, 'wishlist')"
          >
            行きたいに戻す
          </button>
          <button
            type="button"
            class="text-xs text-red-700 disabled:opacity-50"
            :disabled="busyId === s.id"
            :aria-label="`${s.name} をリストから外す`"
            data-testid="item-remove"
            @click="removeItem(s)"
          >
            外す
          </button>
        </template>
      </li>
    </ul>

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

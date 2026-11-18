<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'
import { ApiError } from '~/utils/api'
import type { Comment } from '~/utils/comments'

// 投稿のコメント欄。一覧(古い順、「もっと見る」)・投稿・削除を行う。
// count は投稿のコメント数(見出し用)。投稿・削除に合わせて、親と共有する値を更新する
const props = defineProps<{ spotId: number }>()
const count = defineModel<number>('count', { required: true })

const auth = useAuthStore()
const route = useRoute()
const api = useCommentsApi()

const items = ref<Comment[]>([])
const nextCursor = ref<number | null>(null)
const loading = ref(true)
const loadingMore = ref(false)
const error = ref('')
const body = ref('')
const posting = ref(false)
const deletingId = ref<number | null>(null)

const date = (iso: string) => new Date(iso).toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' })

// 投稿が切り替わったとき、遅れて届いた古い応答で上書きしない
let seq = 0

async function load() {
  const mine = ++seq
  loading.value = true
  error.value = ''
  items.value = []
  nextCursor.value = null
  try {
    const res = await api.list(props.spotId)
    if (mine !== seq) return
    items.value = res.items
    nextCursor.value = res.nextCursor
  } catch (e) {
    if (mine !== seq) return
    error.value = e instanceof ApiError ? e.message : 'コメントを取得できませんでした。'
  } finally {
    if (mine === seq) loading.value = false
  }
}

async function loadMore() {
  const mine = seq
  loadingMore.value = true
  error.value = ''
  try {
    const res = await api.list(props.spotId, nextCursor.value)
    if (mine !== seq) return
    items.value = [...items.value, ...res.items]
    nextCursor.value = res.nextCursor
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '続きを取得できませんでした。'
  } finally {
    loadingMore.value = false
  }
}

async function post() {
  posting.value = true
  error.value = ''
  try {
    const created = await api.create(props.spotId, body.value)
    // 古い順なので、新しいコメントは最後に付く。まだ読み込んでいない続きがあるときは、最後まで読んでから付ける
    // (途中に追加すると、順序が入れ替わるため)
    const mine = seq
    for (let i = 0; nextCursor.value !== null && i < 20; i++) {
      const res = await api.list(props.spotId, nextCursor.value)
      if (mine !== seq) return
      items.value = [...items.value, ...res.items]
      nextCursor.value = res.nextCursor
    }
    if (!items.value.some((c) => c.id === created.id)) items.value = [...items.value, created]
    count.value += 1
    body.value = ''
  } catch (e) {
    error.value = e instanceof ApiError ? (e.fieldErrors?.body?.[0] ?? e.message) : 'コメントを投稿できませんでした。'
  } finally {
    posting.value = false
  }
}

async function remove(comment: Comment) {
  if (!window.confirm('このコメントを削除しますか?元に戻せません。')) return
  deletingId.value = comment.id
  error.value = ''
  try {
    await api.remove(props.spotId, comment.id)
    items.value = items.value.filter((c) => c.id !== comment.id)
    count.value = Math.max(0, count.value - 1)
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'コメントを削除できませんでした。'
  } finally {
    deletingId.value = null
  }
}

watch(() => props.spotId, load, { immediate: true })
</script>

<template>
  <section class="space-y-3 border-t border-gray-200 pt-4" data-testid="comments">
    <h2 class="font-semibold">
      コメント(<span data-testid="comment-count">{{ count }}</span>)
    </h2>

    <p v-if="error" class="rounded bg-red-50 p-3 text-sm text-red-700" role="alert" data-testid="comment-error">
      {{ error }}
    </p>

    <p v-if="loading" class="text-sm text-gray-500">読み込み中…</p>
    <p v-else-if="!items.length && !error" class="text-sm text-gray-500" data-testid="comment-empty">
      まだコメントはありません。
    </p>
    <ul v-else class="space-y-2">
      <li v-for="c in items" :key="c.id" class="rounded bg-white p-3 text-sm" data-testid="comment">
        <p class="flex items-center justify-between text-xs text-gray-500">
          <span>
            <NuxtLink :to="`/users/${c.author.id}`" class="text-sky-700 underline" data-testid="comment-author">
              {{ c.author.name }}
            </NuxtLink>
            ・ {{ date(c.createdAt) }}
          </span>
          <button
            v-if="c.canDelete"
            type="button"
            class="text-red-700 disabled:opacity-50"
            :disabled="deletingId === c.id"
            :aria-label="`${c.author.name} のコメントを削除`"
            data-testid="comment-delete"
            @click="remove(c)"
          >
            削除
          </button>
        </p>
        <!-- 本文は、HTML として解釈せず、文字として表示する(改行は保つ) -->
        <p class="mt-1 whitespace-pre-wrap break-words" data-testid="comment-body">{{ c.body }}</p>
      </li>
    </ul>

    <div v-if="nextCursor" class="text-center">
      <button
        type="button"
        class="rounded border border-gray-300 bg-white px-4 py-2 text-sm text-gray-600 disabled:opacity-50"
        :disabled="loadingMore"
        data-testid="comments-load-more"
        @click="loadMore"
      >
        {{ loadingMore ? '読み込み中…' : 'もっと見る' }}
      </button>
    </div>

    <CommentForm v-if="auth.isLoggedIn" v-model="body" :pending="posting" @submit="post" />
    <p v-else class="text-sm text-gray-600">
      <NuxtLink
        :to="{ path: '/login', query: { redirect: route.fullPath } }"
        class="text-sky-700 underline"
        data-testid="comment-login"
      >
        ログイン
      </NuxtLink>
      すると、コメントできます。
    </p>
  </section>
</template>

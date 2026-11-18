<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'
import { ApiError } from '~/utils/api'
import { toCardSpot, type SpotListItem } from '~/utils/spots'
import type { UserProfile } from '~/utils/users'

const auth = useAuthStore()
const route = useRoute()
const spotsApi = useSpotsApi()
const usersApi = useUsersApi()
const id = computed(() => Number(route.params.id))

const profile = ref<UserProfile | null>(null)
const items = ref<SpotListItem[]>([])
const nextCursor = ref<number | null>(null)
const loading = ref(true)
const loadingMore = ref(false)
const notFound = ref(false)
const error = ref('')
const pending = ref(false)

useHead({ title: () => profile.value?.name ?? 'プロフィール' })

// 別のユーザーへ移動したり、続けて操作したりしたとき、遅れて届いた古い応答で上書きしない
let seq = 0

// プロフィールと投稿の 1 ページ目を取得する。showLoading=false なら、表示を消さずに入れ替える(フォロー後の更新用)
async function load(showLoading = true) {
  const mine = ++seq
  if (showLoading) {
    loading.value = true
    profile.value = null
    items.value = []
    nextCursor.value = null
  }
  notFound.value = false
  error.value = ''
  try {
    const [p, list] = await Promise.all([usersApi.getProfile(id.value), spotsApi.list({ author: id.value })])
    if (mine !== seq) return
    profile.value = p
    items.value = list.items
    nextCursor.value = list.nextCursor
  } catch (e) {
    if (mine !== seq) return
    if (e instanceof ApiError && e.status === 404) notFound.value = true
    else error.value = e instanceof ApiError ? e.message : 'プロフィールを取得できませんでした。'
  } finally {
    if (mine === seq) loading.value = false
  }
}

async function loadMore() {
  const mine = seq
  loadingMore.value = true
  try {
    const list = await spotsApi.list({ author: id.value, cursor: nextCursor.value })
    if (mine !== seq) return
    items.value = [...items.value, ...list.items]
    nextCursor.value = list.nextCursor
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '続きを取得できませんでした。'
  } finally {
    loadingMore.value = false
  }
}

async function toggleFollow() {
  if (!profile.value) return
  // 未ログインなら、ログインしてからこの画面へ戻す
  if (!auth.isLoggedIn) {
    await navigateTo({ path: '/login', query: { redirect: route.fullPath } })
    return
  }
  pending.value = true
  error.value = ''
  try {
    if (profile.value.isFollowing) await usersApi.unfollow(id.value)
    else await usersApi.follow(id.value)
    // フォロー関係で、見られる投稿(フォロワー限定)や投稿数が変わるため、プロフィールと投稿を取り直す
    await load(false)
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'フォローの操作に失敗しました。'
  } finally {
    pending.value = false
  }
}

watch(id, () => load(true), { immediate: true })
</script>

<template>
  <p v-if="loading" class="py-12 text-center text-gray-500">読み込み中…</p>
  <p v-else-if="notFound" class="py-12 text-center text-gray-500" data-testid="not-found">
    ユーザーが見つかりません。
  </p>
  <p v-else-if="error && !profile" class="rounded bg-red-50 p-3 text-sm text-red-700" role="alert">
    {{ error }}
    <button type="button" class="ml-2 underline" @click="load(true)">再読み込み</button>
  </p>

  <section v-else-if="profile" class="space-y-4">
    <div class="flex items-center gap-4">
      <div class="flex size-16 items-center justify-center rounded-full bg-sky-200 text-2xl" aria-hidden="true">
        {{ profile.name.slice(0, 1) }}
      </div>
      <div class="flex-1">
        <h1 class="text-xl font-bold" data-testid="profile-name">{{ profile.name }}</h1>
        <p class="text-sm text-gray-600">
          投稿 <span data-testid="spot-count">{{ profile.spotCount }}</span> ・ フォロー
          <span data-testid="following-count">{{ profile.followingCount }}</span> ・ フォロワー
          <span data-testid="follower-count">{{ profile.followerCount }}</span>
        </p>
      </div>
      <FollowButton v-if="!profile.isMe" :following="profile.isFollowing" :pending="pending" @toggle="toggleFollow" />
    </div>

    <p v-if="error" class="rounded bg-red-50 p-3 text-sm text-red-700" role="alert">{{ error }}</p>

    <p v-if="!items.length" class="py-12 text-center text-gray-500" data-testid="list-empty">投稿がありません。</p>
    <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <SpotCard v-for="s in items" :key="s.id" :spot="toCardSpot(s)" />
    </div>

    <div v-if="nextCursor" class="text-center">
      <button
        class="rounded border border-gray-300 bg-white px-4 py-2 text-sm text-gray-600 disabled:opacity-50"
        type="button"
        :disabled="loadingMore"
        data-testid="load-more"
        @click="loadMore"
      >
        {{ loadingMore ? '読み込み中…' : 'もっと見る' }}
      </button>
    </div>
  </section>
</template>

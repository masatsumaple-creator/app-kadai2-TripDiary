<script setup lang="ts">
import { findUser, mockSpots, mockToCard } from '~/utils/mockData'

const user = findUser(Number(useRoute().params.id))
const isMe = user?.name === 'あなた'
const following = ref(false)
// モック: 公開投稿のみ(自分のプロフィールでは非公開も表示)
const spots = computed(() =>
  mockSpots.filter((s) => s.author === user?.name && (isMe || s.visibility === 'public')),
)
</script>

<template>
  <p v-if="!user" class="py-12 text-center text-gray-500">ユーザーが見つかりません。</p>
  <section v-else class="space-y-4">
    <MockNotice />
    <div class="flex items-center gap-4">
      <div class="flex size-16 items-center justify-center rounded-full bg-sky-200 text-2xl">
        {{ user.name.slice(0, 1) }}
      </div>
      <div class="flex-1">
        <h1 class="text-xl font-bold">{{ user.name }}</h1>
        <p class="text-sm text-gray-600">
          投稿 {{ spots.length }} ・ フォロー {{ user.following }} ・ フォロワー
          {{ user.followers + (following ? 1 : 0) }}
        </p>
      </div>
      <button
        v-if="!isMe"
        type="button"
        class="rounded border px-3 py-1.5 text-sm"
        :class="following ? 'border-gray-300 bg-white' : 'border-sky-600 bg-sky-600 text-white'"
        data-testid="follow"
        @click="following = !following"
      >
        {{ following ? 'フォロー中' : 'フォロー' }}
      </button>
    </div>
    <p v-if="!spots.length" class="py-12 text-center text-gray-500">投稿がありません。</p>
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <SpotCard v-for="s in spots" :key="s.id" :spot="mockToCard(s)" mock />
    </div>
  </section>
</template>

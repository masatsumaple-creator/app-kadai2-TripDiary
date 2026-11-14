<script setup lang="ts">
import { findSpot, visibilityLabels } from '~/utils/mockData'

const route = useRoute()
const spot = findSpot(Number(route.params.id))
const liked = ref(false)
const listState = ref<'none' | 'want' | 'visited'>('none')
const photo = ref(0)
const isMine = spot?.author === 'あなた'
const newComment = ref('')
const comments = ref([...(spot?.comments ?? [])])

function addComment() {
  if (!newComment.value.trim()) return
  comments.value.push({ id: Date.now(), author: 'あなた', body: newComment.value })
  newComment.value = ''
}
</script>

<template>
  <p v-if="!spot" class="py-12 text-center text-gray-500">投稿が見つかりません。</p>
  <article v-else class="space-y-4">
    <NuxtLink to="/" class="text-sm text-sky-700">← 一覧へ</NuxtLink>

    <div
      class="flex h-64 items-center justify-center rounded-lg text-white/80 md:h-80"
      :style="{ background: `linear-gradient(135deg, hsl(${spot.hue + photo * 25} 60% 55%), hsl(${spot.hue + 40} 60% 35%))` }"
    >
      写真 {{ photo + 1 }} / {{ spot.photoCount }}
    </div>
    <div class="flex gap-2">
      <button
        v-for="i in spot.photoCount"
        :key="i"
        type="button"
        class="h-2 w-6 rounded-full"
        :class="photo === i - 1 ? 'bg-sky-600' : 'bg-gray-300'"
        :aria-label="`写真 ${i}`"
        @click="photo = i - 1"
      />
    </div>

    <div>
      <h1 class="text-2xl font-bold">{{ spot.name }}</h1>
      <p class="mt-1 flex flex-wrap gap-1 text-xs">
        <span v-for="a in spot.areas" :key="a" class="rounded bg-sky-100 px-2 py-0.5 text-sky-800">{{ a }}</span>
        <span class="rounded bg-amber-100 px-2 py-0.5 text-amber-800">{{ visibilityLabels[spot.visibility] }}</span>
      </p>
      <p class="mt-1 text-sm text-gray-500">投稿者: {{ spot.author }}</p>
    </div>

    <p class="whitespace-pre-wrap">{{ spot.note }}</p>
    <p class="text-sm text-gray-600">📍 {{ spot.address }}</p>
    <SpotMap :spots="[spot]" class="h-48" />

    <div class="flex flex-wrap items-center gap-2">
      <button
        type="button"
        class="rounded border px-3 py-1.5 text-sm"
        :class="liked ? 'border-pink-400 bg-pink-50 text-pink-700' : 'border-gray-300 bg-white'"
        data-testid="like"
        @click="liked = !liked"
      >
        ♥ {{ spot.likes + (liked ? 1 : 0) }}
      </button>
      <template v-if="!isMine">
        <button
          v-if="listState === 'none'"
          type="button"
          class="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm"
          @click="listState = 'want'"
        >
          行きたいに追加
        </button>
        <template v-else>
          <span class="rounded bg-emerald-100 px-3 py-1.5 text-sm text-emerald-800">
            {{ listState === 'want' ? '行きたい' : '訪問済み' }}
          </span>
          <button
            v-if="listState === 'want'"
            type="button"
            class="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm"
            @click="listState = 'visited'"
          >
            訪問済みにする
          </button>
          <button type="button" class="text-sm text-gray-500 underline" @click="listState = 'none'">
            リストから外す
          </button>
        </template>
      </template>
      <template v-else>
        <NuxtLink :to="`/spots/${spot.id}/edit`" class="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm">
          編集
        </NuxtLink>
        <button type="button" class="rounded border border-red-300 bg-white px-3 py-1.5 text-sm text-red-700">
          削除
        </button>
      </template>
    </div>

    <section class="space-y-3 border-t border-gray-200 pt-4">
      <h2 class="font-semibold">コメント({{ comments.length }})</h2>
      <p v-if="!comments.length" class="text-sm text-gray-500">まだコメントはありません。</p>
      <ul class="space-y-2">
        <li v-for="c in comments" :key="c.id" class="rounded bg-white p-3 text-sm">
          <p class="flex justify-between text-xs text-gray-500">
            <span>{{ c.author }}</span>
            <button v-if="c.author === 'あなた' || isMine" type="button" class="text-red-600">削除</button>
          </p>
          <p>{{ c.body }}</p>
        </li>
      </ul>
      <form class="flex gap-2" @submit.prevent="addComment">
        <input
          v-model="newComment"
          class="flex-1 rounded border border-gray-300 bg-white px-3 py-2 text-sm"
          placeholder="コメントを入力"
        >
        <button class="rounded bg-sky-600 px-4 py-2 text-sm text-white" type="submit">送信</button>
      </form>
    </section>
  </article>
</template>

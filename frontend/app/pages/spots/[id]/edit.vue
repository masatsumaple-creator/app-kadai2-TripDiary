<script setup lang="ts">
import { ApiError } from '~/utils/api'
import type { Spot } from '~/utils/spots'

definePageMeta({ middleware: 'auth' })

useHead({ title: 'スポットを編集' })

const api = useSpotsApi()
const id = Number(useRoute().params.id)

const spot = ref<Spot | null>(null)
const loading = ref(true)
const message = ref('')

try {
  const s = await api.get(id)
  // API 側でも本人以外は更新できない(403)が、画面でも編集フォームを出さない
  if (s.isMine) spot.value = s
  else message.value = 'この投稿を編集できるのは投稿者だけです。'
} catch (e) {
  message.value =
    e instanceof ApiError && e.status === 404
      ? '投稿が見つかりません。削除されたか、閲覧できない投稿です。'
      : '投稿を取得できませんでした。'
} finally {
  loading.value = false
}
</script>

<template>
  <p v-if="loading" class="py-12 text-center text-gray-500">読み込み中…</p>
  <SpotForm v-else-if="spot" :spot="spot" />
  <p
    v-else
    class="py-12 text-center text-gray-500"
    data-testid="edit-unavailable"
  >
    {{ message }}
  </p>
</template>

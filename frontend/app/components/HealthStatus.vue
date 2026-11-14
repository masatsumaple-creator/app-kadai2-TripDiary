<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { fetchHealth } from '~/utils/health'

const state = ref<'loading' | 'ok' | 'error'>('loading')

onMounted(async () => {
  try {
    await fetchHealth()
    state.value = 'ok'
  } catch {
    state.value = 'error'
  }
})
</script>

<template>
  <p
    class="rounded px-3 py-1 text-sm"
    :class="{
      'bg-gray-100 text-gray-600': state === 'loading',
      'bg-green-100 text-green-800': state === 'ok',
      'bg-red-100 text-red-800': state === 'error',
    }"
    data-testid="health-status"
  >
    <template v-if="state === 'loading'">API 確認中…</template>
    <template v-else-if="state === 'ok'">API: 接続OK</template>
    <template v-else>API: 接続できません</template>
  </p>
</template>

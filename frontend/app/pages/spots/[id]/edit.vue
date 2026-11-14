<script setup lang="ts">
import { findSpot } from '~/utils/mockData'

definePageMeta({ middleware: 'auth' })

const spot = findSpot(Number(useRoute().params.id))
</script>

<template>
  <SpotForm v-if="spot" :initial="spot" />
  <p v-else class="py-12 text-center text-gray-500">投稿が見つかりません。</p>
</template>

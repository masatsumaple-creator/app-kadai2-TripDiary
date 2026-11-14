<script setup lang="ts">
import { mockSpots } from '~/utils/mockData'

// モック: フォロー中は「けんた」「みお」とする
const followed = ['けんた', 'みお']
const spots = computed(() => mockSpots.filter((s) => followed.includes(s.author)))
</script>

<template>
  <section class="space-y-4">
    <h1 class="text-xl font-bold">フォロー中</h1>
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <SpotCard v-for="s in spots" :key="s.id" :spot="s" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { prefectures } from '~/utils/spotMeta'

const model = defineModel<string>({ default: '' })
</script>

<template>
  <label class="flex items-center gap-2 text-sm">
    <span class="text-gray-600">エリア</span>
    <select v-model="model" class="rounded border border-gray-300 bg-white px-2 py-1" data-testid="area-filter">
      <option value="">すべて</option>
      <option v-for="p in prefectures" :key="p" :value="p">{{ p }}</option>
    </select>
  </label>
</template>

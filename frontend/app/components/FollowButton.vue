<script setup lang="ts">
// フォロー/フォロー中の切り替えボタン(見た目だけ。API の呼び出しは親の画面が行う)
defineProps<{ following: boolean; pending?: boolean }>()
defineEmits<{ toggle: [] }>()
</script>

<template>
  <button
    type="button"
    class="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
    :class="following ? 'border-gray-300 bg-white text-gray-800' : 'border-sky-700 bg-sky-700 text-white'"
    :aria-pressed="following"
    :disabled="pending"
    data-testid="follow-button"
    @click="$emit('toggle')"
  >
    {{ following ? 'フォロー中' : 'フォロー' }}
  </button>
</template>

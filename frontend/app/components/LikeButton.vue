<script setup lang="ts">
// いいねの表示と切り替え(見た目だけ。API の呼び出しは親の画面が行う)。
// readonly(自分の投稿)のときは、件数だけを表示する。自分の投稿にはいいねできないため
defineProps<{ liked: boolean; count: number; pending?: boolean; readonly?: boolean }>()
defineEmits<{ toggle: [] }>()
</script>

<template>
  <span
    v-if="readonly"
    class="rounded border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700"
    :aria-label="`いいね ${count} 件(自分の投稿にはいいねできません)`"
    data-testid="like-count"
  >
    ♥ {{ count }}
  </span>
  <button
    v-else
    type="button"
    class="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
    :class="liked ? 'border-pink-500 bg-pink-50 text-pink-800' : 'border-gray-300 bg-white text-gray-800'"
    :aria-pressed="liked"
    :aria-label="`いいね ${count} 件`"
    :disabled="pending"
    data-testid="like-button"
    @click="$emit('toggle')"
  >
    ♥ {{ count }}
  </button>
</template>

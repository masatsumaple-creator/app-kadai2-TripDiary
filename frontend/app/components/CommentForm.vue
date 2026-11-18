<script setup lang="ts">
import { COMMENT_MAX_LENGTH, isCommentSubmittable } from '~/utils/comments'

// コメントの入力欄(見た目だけ。API の呼び出しは親が行う)。入力中の文字列は v-model で親と共有する
const body = defineModel<string>({ default: '' })
defineProps<{ pending?: boolean }>()
defineEmits<{ submit: [] }>()
</script>

<template>
  <form class="space-y-2" @submit.prevent="isCommentSubmittable(body) && $emit('submit')">
    <label class="block space-y-1 text-sm">
      <span>コメント</span>
      <textarea
        v-model="body"
        rows="3"
        :maxlength="COMMENT_MAX_LENGTH"
        class="w-full rounded border border-gray-300 bg-white px-3 py-2"
        placeholder="質問やおすすめを書き込めます"
        data-testid="comment-input"
      />
    </label>
    <div class="flex items-center justify-between">
      <span class="text-xs text-gray-500" data-testid="comment-counter">{{ body.length }} / {{ COMMENT_MAX_LENGTH }}</span>
      <button
        type="submit"
        class="rounded bg-sky-700 px-4 py-2 text-sm text-white disabled:bg-gray-300 disabled:text-gray-600"
        :disabled="pending || !isCommentSubmittable(body)"
        data-testid="comment-submit"
      >
        {{ pending ? '送信中…' : '送信' }}
      </button>
    </div>
  </form>
</template>

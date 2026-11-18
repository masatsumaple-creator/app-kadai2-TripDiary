<script setup lang="ts">
import { listStatusLabels, type ListStatus } from '~/utils/lists'

// マイリストの状態の表示と切り替え(見た目だけ。API の呼び出しは親の画面が行う)。
// own(自分の投稿)は、作成時に自動で「訪問済み」になり、変更も削除もできないため、表示だけにする
defineProps<{ status: ListStatus | null; pending?: boolean; own?: boolean }>()
defineEmits<{ set: [status: ListStatus]; remove: [] }>()

const button = 'rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-800 disabled:opacity-50'
</script>

<template>
  <div class="flex flex-wrap items-center gap-2" data-testid="list-buttons">
    <template v-if="own">
      <span class="rounded bg-emerald-100 px-3 py-1.5 text-sm text-emerald-900" data-testid="list-status">
        {{ listStatusLabels.visited }}
      </span>
      <span class="text-xs text-gray-600">自分の投稿は、自動で訪問済みになります</span>
    </template>

    <template v-else-if="status === null">
      <button type="button" :class="button" :disabled="pending" data-testid="list-add-wishlist" @click="$emit('set', 'wishlist')">
        行きたいに追加
      </button>
      <button type="button" :class="button" :disabled="pending" data-testid="list-add-visited" @click="$emit('set', 'visited')">
        訪問済みに追加
      </button>
    </template>

    <template v-else>
      <span class="rounded bg-emerald-100 px-3 py-1.5 text-sm text-emerald-900" data-testid="list-status">
        {{ listStatusLabels[status] }}
      </span>
      <button
        v-if="status === 'wishlist'"
        type="button"
        :class="button"
        :disabled="pending"
        data-testid="list-to-visited"
        @click="$emit('set', 'visited')"
      >
        訪問済みにする
      </button>
      <button
        v-else
        type="button"
        :class="button"
        :disabled="pending"
        data-testid="list-to-wishlist"
        @click="$emit('set', 'wishlist')"
      >
        行きたいに戻す
      </button>
      <button
        type="button"
        class="text-sm text-gray-700 underline disabled:opacity-50"
        :disabled="pending"
        data-testid="list-remove"
        @click="$emit('remove')"
      >
        リストから外す
      </button>
    </template>
  </div>
</template>

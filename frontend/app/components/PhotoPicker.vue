<script setup lang="ts">
import { resizeToJpeg } from '~/utils/image'
import {
  checkPhotoFile,
  PHOTO_ACCEPTED_TYPES,
  PHOTO_MAX_COUNT,
} from '~/utils/photos'

// 投稿フォームの写真の選択。選んだ画像は、その場で縮小(長辺 1600px の JPEG)して、保存のときにアップロードする。
// 編集のときは、すでに付いている写真(existing)も並べ、外せる
export interface PhotoItem {
  // 一覧の表示用の安定したキー
  key: string
  kind: 'existing' | 'new'
  // 既存の写真の ID(kind が existing のとき)
  id?: number
  // 縮小後の画像(kind が new のとき)
  blob?: Blob
  previewUrl: string
  // アップロードの状態(保存のとき、フォームが更新する)
  status?: 'waiting' | 'uploading' | 'failed'
  error?: string
}

const items = defineModel<PhotoItem[]>({ required: true })
const props = defineProps<{ disabled?: boolean }>()

const message = ref('')
const processing = ref(false)
let seq = 0

const remaining = computed(() => PHOTO_MAX_COUNT - items.value.length)

async function onChange(e: Event) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  // 同じファイルを続けて選んでも、change が起きるようにする
  input.value = ''
  if (files.length === 0) return

  message.value = ''
  processing.value = true
  const problems: string[] = []
  const added: PhotoItem[] = []
  for (const file of files) {
    const problem = checkPhotoFile(file, items.value.length + added.length)
    if (problem) {
      problems.push(problem)
      continue
    }
    try {
      const blob = await resizeToJpeg(file)
      added.push({
        key: `new-${++seq}`,
        kind: 'new',
        blob,
        previewUrl: URL.createObjectURL(blob),
      })
    } catch (err) {
      problems.push(err instanceof Error ? err.message : `${file.name}: 追加できませんでした。`)
    }
  }
  items.value = [...items.value, ...added]
  message.value = problems.join(' ')
  processing.value = false
}

function remove(key: string) {
  const target = items.value.find((i) => i.key === key)
  if (target?.kind === 'new') URL.revokeObjectURL(target.previewUrl)
  items.value = items.value.filter((i) => i.key !== key)
  message.value = ''
}

onBeforeUnmount(() => {
  for (const i of items.value) if (i.kind === 'new') URL.revokeObjectURL(i.previewUrl)
})
</script>

<template>
  <fieldset class="space-y-2 rounded border border-gray-200 bg-white p-3 text-sm">
    <legend class="px-1">
      写真(最大 {{ PHOTO_MAX_COUNT }} 枚) <span class="text-gray-500">{{ items.length }} / {{ PHOTO_MAX_COUNT }}</span>
    </legend>

    <label
      class="inline-block cursor-pointer rounded border border-gray-300 px-3 py-1.5 focus-within:ring-2 focus-within:ring-sky-600"
      :class="{ 'cursor-not-allowed opacity-50': props.disabled || processing || remaining <= 0 }"
    >
      📷 写真を追加
      <input
        type="file"
        class="sr-only"
        multiple
        :accept="PHOTO_ACCEPTED_TYPES.join(',')"
        :disabled="props.disabled || processing || remaining <= 0"
        data-testid="photo-input"
        @change="onChange"
      >
    </label>
    <p class="text-xs text-gray-500">
      JPEG・PNG・WebP。長辺 1600px に縮小して保存します(撮影場所などの情報は、削除されます)。
    </p>
    <p v-if="processing" class="text-xs text-gray-600" role="status">画像を処理中…</p>
    <p v-if="message" class="text-xs text-red-600" role="alert" data-testid="photo-message">
      {{ message }}
    </p>

    <ul v-if="items.length" class="grid grid-cols-3 gap-2 sm:grid-cols-5" data-testid="photo-list">
      <li
        v-for="(item, i) in items"
        :key="item.key"
        class="relative"
        data-testid="photo-item"
        :data-status="item.status ?? 'idle'"
      >
        <img
          :src="item.previewUrl"
          :alt="`写真 ${i + 1}`"
          class="aspect-square w-full rounded object-cover"
          :class="{ 'opacity-50': item.status === 'uploading' || item.status === 'waiting' }"
        >
        <span v-if="i === 0" class="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
          代表
        </span>
        <button
          type="button"
          class="absolute right-1 top-1 rounded-full bg-black/60 px-2 text-white disabled:opacity-40"
          :aria-label="`写真 ${i + 1} を外す`"
          :disabled="props.disabled"
          data-testid="photo-remove"
          @click="remove(item.key)"
        >
          ✕
        </button>
        <span v-if="item.status === 'uploading'" class="absolute inset-x-0 bottom-1 text-center text-[10px] text-white" role="status">
          送信中…
        </span>
        <span v-if="item.status === 'failed'" class="absolute inset-x-0 bottom-0 bg-red-600/90 px-1 text-center text-[10px] text-white">
          失敗
        </span>
      </li>
    </ul>
  </fieldset>
</template>

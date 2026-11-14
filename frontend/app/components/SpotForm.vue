<script setup lang="ts">
import { prefectures, visibilityLabels, type MockSpot, type Visibility } from '~/utils/mockData'

const props = defineProps<{ initial?: MockSpot }>()

const name = ref(props.initial?.name ?? '')
const note = ref(props.initial?.note ?? '')
const address = ref(props.initial?.address ?? '')
const lat = ref<number | undefined>(props.initial?.lat)
const lng = ref<number | undefined>(props.initial?.lng)
const areas = ref<string[]>([...(props.initial?.areas ?? [])])
const visibility = ref<Visibility>(props.initial?.visibility ?? 'public')
const photoCount = ref(props.initial?.photoCount ?? 0)
const message = ref('')

function addArea(e: Event) {
  const el = e.target as HTMLSelectElement
  if (el.value && !areas.value.includes(el.value) && areas.value.length < 3) areas.value.push(el.value)
  el.value = ''
}

function fromCurrentLocation() {
  // モック: 位置情報は取得せず、固定の住所を入れる
  address.value = '東京都千代田区丸の内1丁目'
  lat.value = 35.6812
  lng.value = 139.7671
  message.value = '現在地から入力しました(モックの固定値)。必要なら手で修正できます。'
}

function onPhotos(e: Event) {
  const files = (e.target as HTMLInputElement).files
  photoCount.value = Math.min(files?.length ?? 0, 20)
}

const canSave = computed(() => name.value.trim() && areas.value.length >= 1)
const previewSpots = computed<MockSpot[]>(() =>
  lat.value && lng.value
    ? [{ id: 0, name: name.value, note: '', address: address.value, lat: lat.value, lng: lng.value, areas: [], visibility: visibility.value, author: '', likes: 0, hue: 0, photoCount: 0, comments: [] }]
    : [],
)
</script>

<template>
  <form class="mx-auto max-w-2xl space-y-4" @submit.prevent="message = '保存しました(モックのため実際には保存されません)。'">
    <h1 class="text-xl font-bold">{{ initial ? 'スポットを編集' : 'スポットを投稿' }}</h1>

    <label class="block space-y-1 text-sm">
      <span>場所名 <span class="text-red-600">*</span></span>
      <input v-model="name" maxlength="100" class="w-full rounded border border-gray-300 bg-white px-3 py-2" data-testid="name" >
    </label>

    <label class="block space-y-1 text-sm">
      <span>感想</span>
      <textarea v-model="note" rows="5" class="w-full rounded border border-gray-300 bg-white px-3 py-2" />
    </label>

    <div class="space-y-1 text-sm">
      <span>写真(最大 20 枚、JPEG/PNG/WebP、1 枚 5MB まで)</span>
      <input type="file" multiple accept="image/jpeg,image/png,image/webp" class="block" @change="onPhotos" >
      <p class="text-xs text-gray-500">選択中: {{ photoCount }} / 20 枚</p>
    </div>

    <fieldset class="space-y-2 rounded border border-gray-200 bg-white p-3 text-sm">
      <legend class="px-1">場所</legend>
      <button type="button" class="rounded border border-gray-300 px-3 py-1.5" @click="fromCurrentLocation">
        📍 現在地から入力
      </button>
      <label class="block space-y-1">
        <span>住所(最大 255 文字)</span>
        <input v-model="address" maxlength="255" class="w-full rounded border border-gray-300 px-3 py-2" >
      </label>
      <p class="text-xs text-gray-500">緯度経度: {{ lat ?? '-' }}, {{ lng ?? '-' }}</p>
      <p class="text-xs text-gray-500">地図上で位置を指定・調整します(モックでは未対応)</p>
      <SpotMap :spots="previewSpots" class="h-40" />
    </fieldset>

    <div class="space-y-1 text-sm">
      <span>エリアタグ(1〜3 個) <span class="text-red-600">*</span></span>
      <select class="block rounded border border-gray-300 bg-white px-2 py-1" :disabled="areas.length >= 3" @change="addArea">
        <option value="">都道府県を選択</option>
        <option v-for="p in prefectures" :key="p" :value="p">{{ p }}</option>
      </select>
      <p class="flex flex-wrap gap-1">
        <button
          v-for="a in areas"
          :key="a"
          type="button"
          class="rounded bg-sky-100 px-2 py-0.5 text-xs text-sky-800"
          @click="areas = areas.filter((x) => x !== a)"
        >
          {{ a }} ✕
        </button>
      </p>
    </div>

    <fieldset class="text-sm">
      <legend>公開範囲</legend>
      <label v-for="(label, v) in visibilityLabels" :key="v" class="mr-4 inline-flex items-center gap-1">
        <input v-model="visibility" type="radio" :value="v" > {{ label }}
      </label>
    </fieldset>

    <p v-if="message" class="rounded bg-emerald-50 p-2 text-sm text-emerald-800" role="status">{{ message }}</p>

    <div class="flex gap-2">
      <button
        type="submit"
        class="rounded bg-sky-600 px-4 py-2 text-sm text-white disabled:bg-gray-300"
        :disabled="!canSave"
        data-testid="save"
      >
        保存
      </button>
      <NuxtLink to="/" class="rounded border border-gray-300 bg-white px-4 py-2 text-sm">キャンセル</NuxtLink>
    </div>
  </form>
</template>

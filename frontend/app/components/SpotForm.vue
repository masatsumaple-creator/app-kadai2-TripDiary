<script setup lang="ts">
import { ApiError } from '~/utils/api'
import { prefectures, visibilityLabels } from '~/utils/spotMeta'
import {
  emptySpotForm,
  spotToForm,
  toSpotInput,
  type Spot,
} from '~/utils/spots'

// spot を渡すと編集、渡さなければ新規投稿
const props = defineProps<{ spot?: Spot }>()

const api = useSpotsApi()
const form = reactive(props.spot ? spotToForm(props.spot) : emptySpotForm())
const fieldErrors = ref<Record<string, string[]>>({})
const formError = ref('')
const locationMessage = ref('')
const submitting = ref(false)

const canSave = computed(
  () => form.name.trim() !== '' && form.areas.length >= 1 && !submitting.value,
)
const hasLocation = computed(
  () => form.latitude !== null && form.longitude !== null,
)

function addArea(e: Event) {
  const el = e.target as HTMLSelectElement
  if (el.value && !form.areas.includes(el.value) && form.areas.length < 3)
    form.areas.push(el.value)
  el.value = ''
}

// ブラウザの位置情報で緯度・経度を入れる。住所への変換(逆ジオコーディング)は地図の導入後に対応するため、住所は手入力
function fromCurrentLocation() {
  locationMessage.value = ''
  if (!('geolocation' in navigator)) {
    locationMessage.value =
      'このブラウザでは位置情報を使えません。住所を手入力してください。'
    return
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      form.latitude = Number(pos.coords.latitude.toFixed(6))
      form.longitude = Number(pos.coords.longitude.toFixed(6))
      locationMessage.value =
        '現在地の緯度・経度を設定しました。住所は手入力してください。'
    },
    () => {
      locationMessage.value =
        '現在地を取得できませんでした(許可されていない、または取得に失敗しました)。住所を手入力してください。'
    },
    { timeout: 10_000 },
  )
}

function clearLocation() {
  form.latitude = null
  form.longitude = null
  locationMessage.value = ''
}

async function submit() {
  fieldErrors.value = {}
  formError.value = ''
  submitting.value = true
  try {
    const input = toSpotInput(form)
    const saved = props.spot
      ? await api.update(props.spot.id, input)
      : await api.create(input)
    await navigateTo(`/spots/${saved.id}`)
  } catch (e) {
    if (e instanceof ApiError) {
      fieldErrors.value = e.fieldErrors ?? {}
      if (!e.fieldErrors) formError.value = e.message
    } else {
      formError.value = '保存できませんでした。'
    }
  } finally {
    submitting.value = false
  }
}

const errorsOf = (...keys: string[]) =>
  keys.flatMap((k) => fieldErrors.value[k] ?? [])
</script>

<template>
  <form class="mx-auto max-w-2xl space-y-4" novalidate @submit.prevent="submit">
    <h1 class="text-xl font-bold">
      {{ spot ? 'スポットを編集' : 'スポットを投稿' }}
    </h1>

    <label class="block space-y-1 text-sm">
      <span>場所名 <span class="text-red-600">*</span></span>
      <input
        v-model="form.name"
        maxlength="100"
        class="w-full rounded border border-gray-300 bg-white px-3 py-2"
        data-testid="name"
      >
      <span v-for="m in errorsOf('name')" :key="m" class="block text-red-600">{{
        m
      }}</span>
    </label>

    <label class="block space-y-1 text-sm">
      <span>感想</span>
      <textarea
        v-model="form.review"
        rows="5"
        class="w-full rounded border border-gray-300 bg-white px-3 py-2"
        data-testid="review"
      />
      <span
        v-for="m in errorsOf('review')"
        :key="m"
        class="block text-red-600"
        >{{ m }}</span
      >
    </label>

    <p class="rounded bg-gray-100 px-3 py-2 text-sm text-gray-600">
      写真のアップロードは準備中です。
    </p>

    <fieldset
      class="space-y-2 rounded border border-gray-200 bg-white p-3 text-sm"
    >
      <legend class="px-1">場所</legend>
      <div class="flex gap-2">
        <button
          type="button"
          class="rounded border border-gray-300 px-3 py-1.5"
          @click="fromCurrentLocation"
        >
          📍 現在地から入力
        </button>
        <button
          v-if="hasLocation"
          type="button"
          class="text-gray-500 underline"
          @click="clearLocation"
        >
          位置情報を消す
        </button>
      </div>
      <p v-if="locationMessage" class="text-xs text-gray-600" role="status">
        {{ locationMessage }}
      </p>
      <label class="block space-y-1">
        <span>住所(最大 255 文字)</span>
        <input
          v-model="form.address"
          maxlength="255"
          class="w-full rounded border border-gray-300 px-3 py-2"
          data-testid="address"
        >
        <span
          v-for="m in errorsOf('address')"
          :key="m"
          class="block text-red-600"
          >{{ m }}</span
        >
      </label>
      <p class="text-xs text-gray-500">
        緯度経度: {{ form.latitude ?? '-' }}, {{ form.longitude ?? '-' }}
      </p>
      <span
        v-for="m in errorsOf('latitude', 'longitude')"
        :key="m"
        class="block text-red-600"
        >{{ m }}</span
      >
      <p class="text-xs text-gray-500">
        地図上で位置を指定・調整する機能は、地図の導入後に対応します。
      </p>
      <SpotMap
        v-if="form.latitude !== null && form.longitude !== null"
        :spots="[
          {
            id: 0,
            name: form.name || '位置',
            lat: form.latitude,
            lng: form.longitude,
          },
        ]"
        class="h-40"
      />
    </fieldset>

    <div class="space-y-1 text-sm">
      <span>エリアタグ(1〜3 個) <span class="text-red-600">*</span></span>
      <select
        class="block rounded border border-gray-300 bg-white px-2 py-1"
        :disabled="form.areas.length >= 3"
        data-testid="area-select"
        @change="addArea"
      >
        <option value="">都道府県を選択</option>
        <option v-for="p in prefectures" :key="p" :value="p">{{ p }}</option>
      </select>
      <p class="flex flex-wrap gap-1">
        <button
          v-for="a in form.areas"
          :key="a"
          type="button"
          class="rounded bg-sky-100 px-2 py-0.5 text-xs text-sky-800"
          @click="form.areas = form.areas.filter((x) => x !== a)"
        >
          {{ a }} ✕
        </button>
      </p>
      <span
        v-for="m in errorsOf('areas')"
        :key="m"
        class="block text-red-600"
        >{{ m }}</span
      >
    </div>

    <fieldset class="text-sm">
      <legend>公開範囲</legend>
      <label
        v-for="(label, v) in visibilityLabels"
        :key="v"
        class="mr-4 inline-flex items-center gap-1"
      >
        <input
          v-model="form.visibility"
          type="radio"
          :value="v"
          :data-testid="`visibility-${v}`"
        >
        {{ label }}
      </label>
      <span
        v-for="m in errorsOf('visibility')"
        :key="m"
        class="block text-red-600"
        >{{ m }}</span
      >
    </fieldset>

    <p
      v-if="formError"
      class="rounded bg-red-50 p-2 text-sm text-red-700"
      role="alert"
      data-testid="form-error"
    >
      {{ formError }}
    </p>

    <div class="flex gap-2">
      <button
        type="submit"
        class="rounded bg-sky-600 px-4 py-2 text-sm text-white disabled:bg-gray-300"
        :disabled="!canSave"
        data-testid="save"
      >
        {{ submitting ? '保存中…' : '保存' }}
      </button>
      <NuxtLink
        :to="spot ? `/spots/${spot.id}` : '/'"
        class="rounded border border-gray-300 bg-white px-4 py-2 text-sm"
      >
        キャンセル
      </NuxtLink>
    </div>
  </form>
</template>

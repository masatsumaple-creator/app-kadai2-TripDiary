<script setup lang="ts">
import { ApiError } from '~/utils/api'
import { PhotoUploadError } from '~/utils/photos'
import { prefectures, visibilityLabels } from '~/utils/spotMeta'
import {
  emptySpotForm,
  spotToForm,
  toSpotInput,
  type Spot,
} from '~/utils/spots'
import type { PhotoItem } from '~/components/PhotoPicker.vue'

// spot を渡すと編集、渡さなければ新規投稿
const props = defineProps<{ spot?: Spot }>()

const api = useSpotsApi()
const photosApi = usePhotosApi()
const form = reactive(props.spot ? spotToForm(props.spot) : emptySpotForm())

// 写真。編集のときは、すでに付いている写真から始める
const photoItems = ref<PhotoItem[]>(
  (props.spot?.photos ?? []).map((p) => ({
    key: `existing-${p.id}`,
    kind: 'existing' as const,
    id: p.id,
    previewUrl: p.url,
  })),
)
// 保存済みの投稿の ID。写真の送信に失敗して、画面に残ったまま、もう一度保存するとき、
// 投稿を重複して作らないように、更新にする
const savedId = ref<number | undefined>(props.spot?.id)
// サーバーにある写真の ID(外された写真を、保存のときに削除するため)
const serverPhotoIds = ref<number[]>((props.spot?.photos ?? []).map((p) => p.id))
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

const patchItem = (key: string, patch: Partial<PhotoItem>) => {
  photoItems.value = photoItems.value.map((i) =>
    i.key === key ? { ...i, ...patch } : i,
  )
}

// 失敗した枚数を返す
async function syncPhotos(spotId: number): Promise<number> {
  let failures = 0

  const keptIds = new Set(
    photoItems.value.filter((i) => i.kind === 'existing').map((i) => i.id),
  )
  for (const id of serverPhotoIds.value.filter((id) => !keptIds.has(id))) {
    try {
      await photosApi.remove(spotId, id)
    } catch (e) {
      // すでにない(404)なら、目的は果たしている
      if (!(e instanceof ApiError && e.status === 404)) {
        failures++
        continue
      }
    }
    serverPhotoIds.value = serverPhotoIds.value.filter((x) => x !== id)
  }

  for (const item of photoItems.value.filter((i) => i.kind === 'new')) {
    patchItem(item.key, { status: 'uploading', error: undefined })
    try {
      const photo = await photosApi.upload(spotId, item.blob!)
      // 送信できた写真は、既存の写真にする(再保存のとき、二重に送らない)
      patchItem(item.key, { kind: 'existing', id: photo.id, blob: undefined, status: undefined })
      serverPhotoIds.value = [...serverPhotoIds.value, photo.id]
    } catch (e) {
      failures++
      patchItem(item.key, {
        status: 'failed',
        error:
          e instanceof PhotoUploadError || e instanceof ApiError
            ? e.message
            : '送信できませんでした。',
      })
    }
  }
  return failures
}

async function submit() {
  fieldErrors.value = {}
  formError.value = ''
  submitting.value = true
  try {
    const input = toSpotInput(form)
    const saved = savedId.value
      ? await api.update(savedId.value, input)
      : await api.create(input)
    savedId.value = saved.id

    // 写真: 外されたものを削除し、新しいものを 1 枚ずつ送信する。失敗した写真は残して、もう一度保存すると送り直す
    const failures = await syncPhotos(saved.id)
    if (failures > 0) {
      formError.value = `投稿は保存しましたが、${failures} 枚の写真を送信できませんでした。もう一度「保存」を押すと、送信し直します。`
      return
    }
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

    <PhotoPicker v-model="photoItems" :disabled="submitting" />

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
        aria-label="エリアタグを追加"
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
        class="rounded bg-sky-700 px-4 py-2 text-sm text-white disabled:bg-gray-300"
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

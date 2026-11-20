<script setup lang="ts">
import { ApiError } from '~/utils/api'
import { formatLatLng, type LngLat } from '~/utils/map'
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
const geocodeApi = useGeocodeApi()
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
const locating = ref(false)
const geocoding = ref(false)
const mapRef = ref<{ flyTo: (p: LngLat, zoom?: number) => void }>()
// 地図のピン(位置が決まっているときだけ)
const pins = computed(() =>
  form.latitude !== null && form.longitude !== null
    ? [{ id: 0, name: form.name.trim() || '投稿の位置', lat: form.latitude, lng: form.longitude }]
    : [],
)

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

// 位置を設定する(小数 6 桁。約 0.1m)
function setPosition(p: LngLat) {
  form.latitude = Number(p.lat.toFixed(6))
  form.longitude = Number(p.lng.toFixed(6))
}

// この位置の住所を調べて、住所の欄に入れる(利用者が押したときだけ。地図を動かすたびには、呼ばない)
async function fillAddress() {
  if (form.latitude === null || form.longitude === null) return
  geocoding.value = true
  try {
    const address = await geocodeApi.reverse(form.latitude, form.longitude)
    if (address) {
      form.address = address.slice(0, 255)
      locationMessage.value = '住所を入力しました。違うときは、書き換えてください。'
    } else {
      locationMessage.value = 'この位置の住所が見つかりませんでした。住所を手入力してください。'
    }
  } catch (e) {
    locationMessage.value =
      e instanceof ApiError ? e.message : '住所を取得できませんでした。住所を手入力してください。'
  } finally {
    geocoding.value = false
  }
}

// ブラウザの位置情報で、位置(緯度・経度)と住所を入れる。許可されない・取得できないときは、手入力
function fromCurrentLocation() {
  locationMessage.value = ''
  if (!('geolocation' in navigator)) {
    locationMessage.value =
      'このブラウザでは位置情報を使えません。地図をタップするか、住所を手入力してください。'
    return
  }
  locating.value = true
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const p = { lat: pos.coords.latitude, lng: pos.coords.longitude }
      setPosition(p)
      mapRef.value?.flyTo(p)
      locating.value = false
      await fillAddress()
    },
    () => {
      locating.value = false
      locationMessage.value =
        '現在地を取得できませんでした(許可されていない、または取得に失敗しました)。地図をタップするか、住所を手入力してください。'
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
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="rounded border border-gray-300 px-3 py-1.5 disabled:opacity-50"
          :disabled="locating || geocoding"
          data-testid="current-location"
          @click="fromCurrentLocation"
        >
          {{ locating ? '現在地を取得中…' : '📍 現在地から入力' }}
        </button>
        <button
          v-if="hasLocation"
          type="button"
          class="rounded border border-gray-300 px-3 py-1.5 disabled:opacity-50"
          :disabled="locating || geocoding"
          data-testid="fill-address"
          @click="fillAddress"
        >
          {{ geocoding ? '住所を調べ中…' : 'この位置の住所を入力' }}
        </button>
        <button
          v-if="hasLocation"
          type="button"
          class="text-gray-500 underline"
          data-testid="clear-location"
          @click="clearLocation"
        >
          位置情報を消す
        </button>
      </div>
      <p v-if="locationMessage" class="text-xs text-gray-600" role="status" data-testid="location-message">
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
      <p class="text-xs text-gray-500" data-testid="lat-lng">
        緯度経度: {{ form.latitude !== null && form.longitude !== null ? formatLatLng({ lat: form.latitude, lng: form.longitude }) : '-, -' }}
      </p>
      <span
        v-for="m in errorsOf('latitude', 'longitude')"
        :key="m"
        class="block text-red-600"
        >{{ m }}</span
      >
      <p class="text-xs text-gray-500">
        地図をタップするとピンを置けます。ピンはドラッグで動かせます(住所は、「この位置の住所を入力」で、自動入力できます)。
      </p>
      <SpotMap
        ref="mapRef"
        :markers="pins"
        pickable
        draggable
        label="位置の指定"
        class="h-64"
        data-testid="position-map"
        @pick="setPosition"
        @drag="setPosition"
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

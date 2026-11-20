<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Map as MlMap, Marker as MlMarker } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// MapLibre の処理用のワーカー(別スレッド)の場所を、明示する(自動で見つけられず、開発サーバーで読み込みに失敗するため)
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import {
  DEFAULT_VIEW,
  labelLanguageUpdates,
  OFFLINE_STYLE,
  resolveMapConfig,
  toBounds,
  type Bounds,
  type LngLat,
  type MapView,
} from '~/utils/map'

// 地図(MapLibre GL JS)。
// - 本番: Amazon Location Service の地図。ブラウザが、Cognito の一時的な認証情報で、リクエストに署名する
// - 開発・テスト(ID プールの指定なし): 地図の絵のない背景。ピン・クリック・ドラッグは、そのまま動く
// ピンは、キーボードで操作できる <button> の HTML 要素(場所名が、読み上げの名前)
export interface MapMarker extends LngLat {
  id: number
  name: string
}

const props = withDefaults(
  defineProps<{
    markers: MapMarker[]
    selectedId?: number
    // 最初の表示。なければ、ピンが 1 つならその位置(拡大)、複数・なしなら日本全体
    view?: MapView
    // false なら、動かせない(詳細の小さな地図)
    interactive?: boolean
    // true なら、地図のクリックで、位置を指す(投稿フォーム)
    pickable?: boolean
    // true なら、ピンをドラッグで動かせる(投稿フォーム)
    draggable?: boolean
    label?: string
  }>(),
  { selectedId: undefined, view: undefined, interactive: true, pickable: false, draggable: false, label: '地図' },
)

const emit = defineEmits<{
  select: [id: number]
  // 表示範囲が変わった(最初の読み込みのあとにも 1 回)
  bounds: [bounds: Bounds]
  pick: [position: LngLat]
  drag: [position: LngLat]
}>()

const container = ref<HTMLElement>()
const failed = ref('')
const ready = ref(false)

let map: MlMap | undefined
let markerClass: typeof import('maplibre-gl').Marker | undefined
let current: { marker: MlMarker; button: HTMLButtonElement; id: number }[] = []

const initialView = (): MapView => {
  if (props.view) return props.view
  const only = props.markers.length === 1 ? props.markers[0] : undefined
  return only ? { lat: only.lat, lng: only.lng, zoom: 14 } : DEFAULT_VIEW
}

// MapLibre は、渡した要素の transform で位置を決めるため、拡大などの見た目は、内側のボタンに付ける
function pinElement(m: MapMarker): { wrap: HTMLElement; button: HTMLButtonElement } {
  const wrap = document.createElement('div')
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = '📍'
  button.className = 'map-pin'
  button.setAttribute('aria-label', m.name)
  button.dataset['testid'] = 'map-pin'
  button.dataset['id'] = String(m.id)
  wrap.appendChild(button)
  return { wrap, button }
}

function syncMarkers() {
  if (!map || !markerClass) return
  for (const c of current) c.marker.remove()
  current = props.markers.map((m) => {
    const { wrap, button } = pinElement(m)
    button.addEventListener('click', (e) => {
      e.stopPropagation()
      emit('select', m.id)
    })
    const marker = new markerClass!({ element: wrap, anchor: 'bottom', draggable: props.draggable })
      .setLngLat([m.lng, m.lat])
      .addTo(map!)
    marker.on('dragend', () => {
      const p = marker.getLngLat()
      emit('drag', { lat: p.lat, lng: p.lng })
    })
    return { marker, button, id: m.id }
  })
  syncSelected()
}

function syncSelected() {
  for (const c of current) c.button.classList.toggle('map-pin--selected', c.id === props.selectedId)
}

function emitBounds() {
  if (!map) return
  const b = map.getBounds()
  emit('bounds', toBounds({ south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() }))
}

// 親から、地図を動かす(「現在地から入力」のあとなど)
function flyTo(position: LngLat, zoom?: number) {
  map?.flyTo({ center: [position.lng, position.lat], zoom: zoom ?? Math.max(map.getZoom(), 14), essential: true })
}
defineExpose({ flyTo })

onMounted(async () => {
  if (!container.value) return
  try {
    const rc = useRuntimeConfig().public
    const config = resolveMapConfig({
      identityPoolId: rc.mapIdentityPoolId as string | undefined,
      region: rc.mapRegion as string | undefined,
    })
    let style: unknown = OFFLINE_STYLE
    let auth: Record<string, unknown> = {}
    if (config.kind === 'aws') {
      const { withIdentityPoolId } = await import('@aws/amazon-location-utilities-auth-helper')
      const helper = await withIdentityPoolId(config.identityPoolId!)
      style = config.styleUrl
      auth = helper.getMapAuthenticationOptions() as unknown as Record<string, unknown>
    }

    // MapLibre は、使うときに読み込む(最初の画面の読み込みを重くしない)
    const ml = await import('maplibre-gl')
    ml.setWorkerUrl(workerUrl)
    markerClass = ml.Marker
    const v = initialView()
    map = new ml.Map({
      container: container.value,
      style: style as never,
      center: [v.lng, v.lat],
      zoom: v.zoom,
      interactive: props.interactive,
      attributionControl: { compact: true },
      ...auth,
    })
    if (props.interactive) map.addControl(new ml.NavigationControl({ showCompass: false }), 'top-right')

    map.on('error', (e) => {
      // 地図の絵(タイル・スタイル)を取れなかった。ピンや位置の操作は、そのまま使える
      if (!ready.value) failed.value = '地図の絵を読み込めませんでした。位置とピンは、そのまま使えます。'
      console.warn('map error', e.error)
    })
    map.on('load', () => {
      ready.value = true
      // 地名を、日本語優先にする(標準のスタイルは、英語名を優先するため)
      for (const { id, expression } of labelLanguageUpdates(map!.getStyle().layers as never)) {
        map!.setLayoutProperty(id, 'text-field', expression as never)
      }
      syncMarkers()
      emitBounds()
    })
    map.on('moveend', emitBounds)
    if (props.pickable) {
      map.on('click', (e) => emit('pick', { lat: e.lngLat.lat, lng: e.lngLat.lng }))
    }
    // style の読み込みを待たず、ピンを置く(オフラインでも、すぐ操作できる)
    syncMarkers()
  } catch (e) {
    failed.value = 'このブラウザでは、地図を表示できません。'
    console.warn('map init failed', e)
  }
})

watch(() => props.markers, syncMarkers, { deep: true })
watch(() => props.selectedId, syncSelected)

onBeforeUnmount(() => {
  for (const c of current) c.marker.remove()
  current = []
  map?.remove()
  map = undefined
})
</script>

<template>
  <div class="relative overflow-hidden rounded-lg border border-gray-200 bg-sky-50" role="group" :aria-label="label">
    <!-- MapLibre が、この要素を position: relative にするため、高さは、h-full(親の高さ)で指定する -->
    <div ref="container" class="h-full w-full" data-testid="map-canvas" />
    <p
      v-if="failed"
      class="absolute inset-x-2 top-2 z-10 rounded bg-white/90 px-2 py-1 text-xs text-gray-700"
      role="status"
      data-testid="map-failed"
    >
      {{ failed }}
    </p>
  </div>
</template>

<style>
.map-pin {
  font-size: 1.75rem;
  line-height: 1;
  cursor: pointer;
  background: none;
  border: 0;
  padding: 0;
}
.map-pin--selected {
  transform: scale(1.3);
  z-index: 2;
}
</style>

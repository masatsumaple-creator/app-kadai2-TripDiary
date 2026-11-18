<script setup lang="ts">
// 画面の題名は「<題名> | TripDiary」の形にする。既定の題名(TripDiary)のときは重ねない
useHead({
  titleTemplate: (title?: string) => (!title || title === 'TripDiary' ? 'TripDiary' : `${title} | TripDiary`),
})
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>

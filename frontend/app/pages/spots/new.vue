<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

useHead({ title: 'スポットを投稿' })
</script>

<template>
  <SpotForm />
</template>

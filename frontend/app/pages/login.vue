<script setup lang="ts">
const mode = ref<'login' | 'register'>('login')
const email = ref('')
const password = ref('')
const displayName = ref('')
const errors = ref<Record<string, string>>({})
const done = ref(false)

function submit() {
  const e: Record<string, string> = {}
  if (!/^\S+@\S+\.\S+$/.test(email.value)) e.email = 'メールアドレスの形式で入力してください。'
  if (password.value.length < 8) e.password = 'パスワードは 8 文字以上で入力してください。'
  if (mode.value === 'register' && !displayName.value.trim()) e.displayName = '表示名を入力してください。'
  errors.value = e
  done.value = Object.keys(e).length === 0
}
</script>

<template>
  <section class="mx-auto max-w-sm space-y-4">
    <div class="flex border-b border-gray-200 text-sm">
      <button
        v-for="m in ['login', 'register'] as const"
        :key="m"
        type="button"
        class="flex-1 py-2"
        :class="mode === m ? 'border-b-2 border-sky-600 font-semibold text-sky-700' : 'text-gray-500'"
        @click="((mode = m), (errors = {}), (done = false))"
      >
        {{ m === 'login' ? 'ログイン' : '新規登録' }}
      </button>
    </div>

    <form class="space-y-3" novalidate @submit.prevent="submit">
      <label v-if="mode === 'register'" class="block space-y-1 text-sm">
        <span>表示名</span>
        <input v-model="displayName" class="w-full rounded border border-gray-300 bg-white px-3 py-2" >
        <span v-if="errors.displayName" class="text-red-600">{{ errors.displayName }}</span>
      </label>
      <label class="block space-y-1 text-sm">
        <span>メールアドレス</span>
        <input v-model="email" type="email" class="w-full rounded border border-gray-300 bg-white px-3 py-2" >
        <span v-if="errors.email" class="text-red-600">{{ errors.email }}</span>
      </label>
      <label class="block space-y-1 text-sm">
        <span>パスワード</span>
        <input v-model="password" type="password" class="w-full rounded border border-gray-300 bg-white px-3 py-2" >
        <span v-if="errors.password" class="text-red-600">{{ errors.password }}</span>
      </label>
      <p v-if="done" class="rounded bg-emerald-50 p-2 text-sm text-emerald-800" role="status">
        {{ mode === 'login' ? 'ログインしました' : '登録しました' }}(モックのため実際には処理されません)。
      </p>
      <button type="submit" class="w-full rounded bg-sky-600 py-2 text-sm text-white">
        {{ mode === 'login' ? 'ログイン' : '登録する' }}
      </button>
    </form>
  </section>
</template>

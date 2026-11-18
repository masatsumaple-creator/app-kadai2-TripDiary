<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'
import { ApiError } from '~/utils/api'
import { safeRedirect } from '~/utils/redirect'

const auth = useAuthStore()
const route = useRoute()

// ログイン済みならログイン画面は見せない
if (auth.isLoggedIn) await navigateTo(safeRedirect(route.query.redirect), { replace: true })

const mode = ref<'login' | 'register'>('login')
useHead({ title: () => (mode.value === 'login' ? 'ログイン' : '新規登録') })
const email = ref('')
const password = ref('')
const displayName = ref('')
const fieldErrors = ref<Record<string, string[]>>({})
const formError = ref('')
const submitting = ref(false)

function switchMode(m: 'login' | 'register') {
  mode.value = m
  fieldErrors.value = {}
  formError.value = ''
}

async function submit() {
  fieldErrors.value = {}
  formError.value = ''
  submitting.value = true
  try {
    if (mode.value === 'login') await auth.login(email.value, password.value)
    else await auth.register(displayName.value, email.value, password.value)
    await navigateTo(safeRedirect(route.query.redirect))
  } catch (e) {
    if (e instanceof ApiError) {
      fieldErrors.value = e.fieldErrors ?? {}
      // 項目ごとのエラーがなければ、画面上部にまとめて表示する
      if (!e.fieldErrors) formError.value = e.message
    } else {
      formError.value = 'エラーが発生しました。'
    }
  } finally {
    submitting.value = false
  }
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
        :class="mode === m ? 'border-b-2 border-sky-700 font-semibold text-sky-700' : 'text-gray-500'"
        @click="switchMode(m)"
      >
        {{ m === 'login' ? 'ログイン' : '新規登録' }}
      </button>
    </div>

    <form class="space-y-3" novalidate @submit.prevent="submit">
      <label v-if="mode === 'register'" class="block space-y-1 text-sm">
        <span>表示名</span>
        <input v-model="displayName" class="w-full rounded border border-gray-300 bg-white px-3 py-2" data-testid="name" >
        <span v-for="msg in fieldErrors.name" :key="msg" class="block text-red-600">{{ msg }}</span>
      </label>
      <label class="block space-y-1 text-sm">
        <span>メールアドレス</span>
        <input
          v-model="email"
          type="email"
          autocomplete="email"
          class="w-full rounded border border-gray-300 bg-white px-3 py-2"
          data-testid="email"
        >
        <span v-for="msg in fieldErrors.email" :key="msg" class="block text-red-600">{{ msg }}</span>
      </label>
      <label class="block space-y-1 text-sm">
        <span>パスワード</span>
        <input
          v-model="password"
          type="password"
          :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
          class="w-full rounded border border-gray-300 bg-white px-3 py-2"
          data-testid="password"
        >
        <span v-for="msg in fieldErrors.password" :key="msg" class="block text-red-600">{{ msg }}</span>
      </label>
      <p v-if="formError" class="rounded bg-red-50 p-2 text-sm text-red-700" role="alert" data-testid="form-error">
        {{ formError }}
      </p>
      <button
        type="submit"
        class="w-full rounded bg-sky-700 py-2 text-sm text-white disabled:bg-gray-300"
        :disabled="submitting"
        data-testid="submit"
      >
        {{ mode === 'login' ? 'ログイン' : '登録する' }}
      </button>
    </form>
  </section>
</template>

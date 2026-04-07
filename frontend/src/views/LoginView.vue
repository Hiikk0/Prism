<script setup lang="ts">
import { ref } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
const authStore = useAuthStore();
const router = useRouter();

const username = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);

const handleLogin = async () => {
  loading.value = true;
  error.value = '';
  try {
    await authStore.login({ email: username.value, password: password.value });
    router.push({ name: 'home' });
  } catch (err: any) {
    error.value = err.response?.data?.error || t('auth.error_generic');
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <div class="flex items-center justify-center min-h-screen">
    <div class="w-full max-w-md p-8 aero-card">
      <div class="mb-8 text-center">
        <h1 class="text-3xl font-bold tracking-tight neon-text">{{ t('auth.login') }}</h1>
        <p class="mt-2 text-sm text-gray-400">Prism Media Server</p>
      </div>

      <form @submit.prevent="handleLogin" class="space-y-6">
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-1">{{ t('auth.username') }}</label>
          <input 
            v-model="username" 
            type="text" 
            required 
            class="w-full p-3 bg-white/5 border border-white/10 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all"
            placeholder="username"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-1">{{ t('auth.password') }}</label>
          <input 
            v-model="password" 
            type="password" 
            required 
            class="w-full p-3 bg-white/5 border border-white/10 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all"
            placeholder="••••••••"
          />
        </div>

        <div v-if="error" class="p-3 text-xs text-red-400 border border-red-400/20 rounded-lg bg-red-400/10">
          {{ error }}
        </div>

        <button 
          type="submit" 
          :disabled="loading"
          class="w-full p-3 font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-500 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100"
        >
          <span v-if="loading">{{ t('common.loading') || '...' }}</span>
          <span v-else>{{ t('auth.login') }}</span>
        </button>
      </form>

      <div class="mt-6 text-center">
        <p class="text-sm text-gray-400">
          {{ t('auth.no_account') || 'Нет аккаунта?' }}
          <router-link :to="{ name: 'register' }" class="font-medium text-blue-400 hover:text-blue-300 ml-1">
            {{ t('auth.register') }}
          </router-link>
        </p>
      </div>
    </div>
  </div>
</template>

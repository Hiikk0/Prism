<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useI18n } from 'vue-i18n';
import {
  User, LogIn, UserPlus, Globe, Languages, HelpCircle, KeySquare,
  ArrowLeft, ArrowRight, ArrowUp, ArrowDown,
} from 'lucide-vue-next';
import XmbContainer from '@/components/xmb/XmbContainer.vue';
import type { XmbCategory } from '@/composables/useXmbNavigation';

const router  = useRouter();
const authStore = useAuthStore();
const { t, locale } = useI18n();

// ── Form State ────────────────────────────────────────────────────────────────
const formType = ref<'login' | 'register'>('login');
const email    = ref('');
const password = ref('');
const error    = ref('');
const loading  = ref(false);

// ── XMB Category Data ─────────────────────────────────────────────────────────
const categories: XmbCategory[] = [
  {
    id: 'auth',
    icon: User,
    label: 'Users',
    items: [
      {
        id: 'login',
        icon: LogIn,
        label: () => t('auth.login'),
        action: 'open_sub',
        hint: 'Authenticate your Prism account to access the full media library.',
      },
      {
        id: 'guest',
        icon: HelpCircle,
        label: () => 'Гість',
        action: 'login_guest',
        hint: 'Browse the media server temporarily without creating an account.',
      },
      {
        id: 'register',
        icon: UserPlus,
        label: () => t('auth.register'),
        action: 'open_sub',
        hint: 'Create a new Prism account on this media server.',
      },
    ],
  },
  {
    id: 'lang',
    icon: Globe,
    label: 'Settings',
    items: [
      {
        id: 'uk',
        icon: Languages,
        label: () => 'Українська',
        action: 'set_lang_uk',
        hint: 'Змінити мову інтерфейсу на українську.',
      },
      {
        id: 'en',
        icon: Languages,
        label: () => 'English',
        action: 'set_lang_en',
        hint: 'Set the interface language to English.',
      },
    ],
  },
];

// ── Action Handler (from XmbContainer @action emit) ───────────────────────────
const handleAction = (payload: { catId: string; itemId: string }) => {
  const cat  = categories.find(c => c.id === payload.catId);
  const item = cat?.items.find(i => i.id === payload.itemId);
  if (!item) return;

  if (item.action === 'set_lang_uk')  { locale.value = 'uk'; }
  else if (item.action === 'set_lang_en') { locale.value = 'en'; }
  else if (item.action === 'login_guest') { router.push({ name: 'home' }); }
  else if (item.action === 'open_sub') {
    formType.value = item.id as 'login' | 'register';
    error.value = '';
    email.value = '';
    password.value = '';
  }
};

const handleBack = () => {
  // nothing extra needed — XmbContainer handles isInputActive
};

// ── Auth Submit ───────────────────────────────────────────────────────────────
const handleAuthSubmit = async (close: () => void) => {
  loading.value = true;
  error.value   = '';
  try {
    if (formType.value === 'login') {
      await authStore.login({ email: email.value, password: password.value });
    } else {
      await authStore.register({ email: email.value, password: password.value });
    }
    router.push({ name: 'home' });
  } catch (err: any) {
    error.value = err.response?.data?.error || t('auth.error_generic');
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <div class="h-screen w-screen bg-[#060606] overflow-hidden relative font-sans text-white/90">

    <!-- XMB Background Wave -->
    <div class="absolute inset-0 pointer-events-none -z-10">
      <div class="absolute w-[200%] h-px bg-white/20 left-[-50%] top-[38%] blur-sm -rotate-3 shadow-[0_0_30px_12px_rgba(255,255,255,0.07)]"></div>
      <div class="absolute w-[200%] h-px bg-white/10 left-[-50%] top-[41%] blur-xs rotate-1 shadow-[0_0_40px_18px_rgba(255,255,255,0.04)]"></div>
    </div>

    <!-- XMB Navigation Container -->
    <XmbContainer
      :categories="categories"
      @action="handleAction"
      @back="handleBack"
    >
      <!-- Sub-Item Slot: Auth Form -->
      <template #subitem="{ activeItem, close }">
        <div class="absolute inset-0 flex items-start" style="left: 280px; top: 260px;">
          
          <!-- Item breadcrumb header -->
          <div class="flex flex-col">
            <div class="flex items-center gap-4 mb-10">
              <component :is="activeItem?.icon" :size="28" stroke-width="1.5" class="text-white/70" />
              <span class="text-3xl font-light tracking-widest text-white">
                {{ typeof activeItem?.label === 'function' ? activeItem?.label() : activeItem?.label }}
              </span>
            </div>

            <form @submit.prevent="handleAuthSubmit(close)" class="flex flex-col gap-7 w-[360px]">

              <div class="flex flex-col gap-1">
                <label class="text-[10px] font-bold tracking-widest uppercase text-white/40">
                  {{ t('auth.email') }}
                </label>
                <input
                  v-model="email"
                  type="email"
                  required
                  autofocus
                  class="bg-transparent border-b border-white/25 py-2 text-xl font-light text-white outline-none focus:border-white transition-colors"
                  placeholder="user@prism.io"
                />
              </div>

              <div class="flex flex-col gap-1">
                <label class="text-[10px] font-bold tracking-widest uppercase text-white/40 flex items-center gap-1">
                  <KeySquare :size="11" /> {{ t('auth.password') }}
                </label>
                <input
                  v-model="password"
                  type="password"
                  required
                  class="bg-transparent border-b border-white/25 py-2 text-xl font-light text-white outline-none focus:border-white transition-colors"
                  placeholder="••••••••"
                />
              </div>

              <div v-if="error" class="text-red-400 text-sm font-light">{{ error }}</div>

              <div class="flex items-center gap-6 mt-4">
                <button
                  type="submit"
                  :disabled="loading"
                  class="bg-white/90 hover:bg-white text-black text-sm font-bold tracking-widest uppercase px-8 py-3 transition-colors disabled:opacity-50"
                >
                  {{ loading ? '...' : 'ENTER' }}
                </button>
                <button
                  type="button"
                  @click="close()"
                  class="text-white/30 hover:text-white/80 text-xs font-bold tracking-widest uppercase transition-colors cursor-pointer"
                >
                  ESC / Cancel
                </button>
              </div>

            </form>
          </div>
        </div>
      </template>
    </XmbContainer>

    <!-- Footer hints -->
    <div class="absolute bottom-6 right-10 flex gap-6 text-[10px] tracking-[0.2em] font-bold text-white/20 uppercase select-none">
      <span class="flex items-center gap-1"><ArrowUp :size="12" /><ArrowDown :size="12" /> Navigate</span>
      <span class="flex items-center gap-1"><ArrowLeft :size="12" /><ArrowRight :size="12" /> Category</span>
      <span>Enter — Confirm</span>
    </div>
  </div>
</template>

<style scoped>
input:-webkit-autofill,
input:-webkit-autofill:hover,
input:-webkit-autofill:focus,
input:-webkit-autofill:active {
  -webkit-box-shadow: 0 0 0 30px #060606 inset !important;
  -webkit-text-fill-color: white !important;
  transition: background-color 5000s ease-in-out 0s;
}
</style>

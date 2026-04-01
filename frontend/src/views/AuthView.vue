<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useI18n } from 'vue-i18n';
import { User, LogIn, UserPlus, Globe, Languages, KeySquare, HelpCircle, ArrowRight, ArrowUp, ArrowDown } from 'lucide-vue-next';
import XmbContainer from '@/components/xmb/XmbContainer.vue';
import { type XmbCategory, type XmbItem } from '@/composables/useXmbNavigation';

const router = useRouter();
const authStore = useAuthStore();
const { t, locale } = useI18n();

// ----------------------------------------------------------------------------
// DATA MAPPING
// ----------------------------------------------------------------------------

const categories = computed<XmbCategory[]>(() => [
  { 
    id: 'auth', 
    icon: User, 
    title: 'Users',
    items: [
      { id: 'login', icon: LogIn, label: () => t('auth.login'), action: 'open_sub' },
      { id: 'guest', icon: HelpCircle, label: () => 'Увійти як гість', action: 'login_guest' },
      { id: 'register', icon: UserPlus, label: () => t('auth.register'), action: 'open_sub' },
    ]
  },
  { 
    id: 'lang', 
    icon: Globe, 
    title: 'System Settings',
    items: [
      { id: 'uk', icon: Languages, label: () => 'Українська', action: 'set_lang_uk' },
      { id: 'en', icon: Languages, label: () => 'English', action: 'set_lang_en' },
    ]
  },
]);

const hints = {
  'auth-login': 'Authenticate your Prism account to access full library features.',
  'auth-guest': 'Explore the library temporarily without an account.',
  'auth-register': 'Create a new account on this media server.',
  'lang-uk': 'Змінити мову інтерфейсу на українську.',
  'lang-en': 'Change interface language to English.',
};

const subItemOpen = ref(false);
const activeItem = ref<XmbItem | null>(null);

// Auth Form State
const email = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);
const formType = ref<'login' | 'register'>('login');

// Reference to XmbContainer for key handling
const xmbRef = ref<any>(null);

// ----------------------------------------------------------------------------
// LOGIC
// ----------------------------------------------------------------------------

const handleSelect = (item: XmbItem) => {
  activeItem.value = item;
  handleItemAction();
};

const handleItemAction = async () => {
  if (!activeItem.value) return;

  const action = activeItem.value.action;
  if (action === 'set_lang_uk') {
    locale.value = 'uk';
  } else if (action === 'set_lang_en') {
    locale.value = 'en';
  } else if (action === 'login_guest') {
    router.push({ name: 'home' }); 
  } else if (action === 'open_sub') {
    formType.value = activeItem.value.id as 'login' | 'register';
    subItemOpen.value = true;
    error.value = '';
    email.value = '';
    password.value = '';
  }
};

const handleAuthSubmit = async () => {
  loading.value = true;
  error.value = '';
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

// Global Key Listeners
const onKeydown = (e: KeyboardEvent) => {
  if (subItemOpen.value) {
    if (e.key === 'Escape' || e.key === 'Backspace') {
      subItemOpen.value = false;
      error.value = '';
    }
    return;
  }
  
  // Forward to XMB component if needed
  if (xmbRef.value) {
    xmbRef.value.handleKeydown(e);
  }
};

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown);
});

</script>

<template>
  <div class="h-screen w-screen bg-[#050505] overflow-hidden relative font-sans text-white/90">
    
    <!-- True XMB Dynamic Wave -->
    <div class="absolute inset-x-0 h-[300px] top-1/2 -translate-y-1/2 pointer-events-none z-[-1] mix-blend-screen overflow-hidden opacity-30">
      <div class="absolute w-[200%] h-1 bg-white/40 left-[-50%] top-[40%] blur-[2px] transform -rotate-3 shadow-[0_0_20px_10px_rgba(255,255,255,0.1)]"></div>
      <div class="absolute w-[200%] h-1 bg-white/20 left-[-50%] top-[50%] blur-xs transform rotate-1 shadow-[0_0_30px_15px_rgba(255,255,255,0.1)]"></div>
    </div>

    <!-- XMB Container Component -->
    <XmbContainer 
      ref="xmbRef"
      :categories="categories"
      cross-x="25%"
      cross-y="35%"
      :h-spacing="160"
      :v-spacing="80"
      :sub-item-open="subItemOpen"
      @select="handleSelect"
    />

    <!-- SUB-ITEM COMPONENT (Authentication Form Overlay) -->
    <transition 
      enter-active-class="transition-all duration-400 ease-out delay-100" 
      enter-from-class="opacity-0 translate-x-16 scale-95" 
      leave-active-class="transition-all duration-300 ease-in" 
      leave-to-class="opacity-0 translate-x-16 scale-95"
    >
      <div 
        v-if="subItemOpen" 
        class="absolute flex flex-col items-start"
        style="left: 25%; top: 35%;"
      >
        <!-- Form context icon and label (positioned relative to Cross) -->
        <div class="flex items-center gap-6 mb-12 opacity-80 -ml-[80px]">
          <component :is="activeItem?.icon" :size="32" stroke-width="1.5" class="drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]" />
          <span class="text-3xl font-light tracking-widest text-[#ececec] drop-shadow-[0_0_8px_rgba(255,255,255,0.6)]">{{ activeItem?.label() }}</span>
        </div>

        <form @submit.prevent="handleAuthSubmit" class="w-[400px] flex flex-col gap-8 ml-[56px]">
          <div class="flex flex-col gap-1 relative">
            <label class="text-[11px] font-bold text-white/50 tracking-widest uppercase mb-1 flex items-center gap-2">
              <User :size="14" />
              {{ t('auth.email') }}
            </label>
            <input 
              v-model="email" 
              type="email" 
              required
              class="w-full bg-black/50 border border-white/10 p-3 text-lg font-light text-white outline-none focus:border-white/40 focus:bg-white/5 transition-all shadow-inner"
              placeholder="john.doe@prism.io"
            />
          </div>

          <div class="flex flex-col gap-1 relative">
            <label class="text-[11px] font-bold text-white/50 tracking-widest uppercase mb-1 flex items-center gap-2">
              <KeySquare :size="14" />
              {{ t('auth.password') }}
            </label>
            <input 
              v-model="password" 
              type="password" 
              required
              class="w-full bg-black/50 border border-white/10 p-3 text-lg font-light text-white outline-none focus:border-white/40 focus:bg-white/5 transition-all shadow-inner"
              placeholder="••••••••"
            />
          </div>

          <div v-if="error" class="text-red-400 text-[13px] font-light">{{ error }}</div>

          <div class="flex items-center gap-6 mt-6">
            <button 
              type="submit" 
              :disabled="loading"
              class="bg-white text-black px-10 py-3 font-bold tracking-widest outline-none focus:bg-white focus:ring-4 focus:ring-white/20 transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {{ loading ? t('common.loading') : 'ENTER' }}
              <ArrowRight :size="16" stroke-width="3" />
            </button>
            <button 
              type="button" 
              @click="subItemOpen = false"
              class="text-white/30 hover:text-white text-[11px] font-bold tracking-[0.2em] transition-colors uppercase cursor-pointer outline-none focus:text-white"
            >
              ESC CANCEL
            </button>
          </div>
        </form>
      </div>
    </transition>

    <!-- Footer Global Nav Hints -->
    <div class="absolute bottom-8 right-12 flex gap-8 text-[11px] tracking-widest font-bold text-white/20 uppercase pointer-events-none">
       <span class="flex items-center gap-2"><ArrowUp :size="14"/> <ArrowDown :size="14"/> SELECT</span>
       <span>Action (Enter)</span>
    </div>
  </div>
</template>


<style scoped>
/* Reset autocompletes to match the dark aesthetic strongly */
input:-webkit-autofill,
input:-webkit-autofill:hover, 
input:-webkit-autofill:focus, 
input:-webkit-autofill:active {
    -webkit-box-shadow: 0 0 0 30px #1a1a1a inset !important;
    -webkit-text-fill-color: white !important;
    transition: background-color 5000s ease-in-out 0s;
}
</style>


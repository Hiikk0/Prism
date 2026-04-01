<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useI18n } from 'vue-i18n';
import { User, LogIn, UserPlus, Globe, Languages, KeySquare, HelpCircle, ArrowLeft, ArrowRight, ArrowUp, ArrowDown } from 'lucide-vue-next';

const router = useRouter();
const authStore = useAuthStore();
const { t, locale } = useI18n();

// ----------------------------------------------------------------------------
// XMB UI STATE
// ----------------------------------------------------------------------------

const categories = [
  { id: 'auth', icon: User, title: 'Users' },
  { id: 'lang', icon: Globe, title: 'System Settings' },
];

const items = {
  auth: [
    { id: 'login', icon: LogIn, label: () => t('auth.login'), action: 'open_sub' },
    { id: 'guest', icon: HelpCircle, label: () => 'Увійти як гість', action: 'login_guest' },
    { id: 'register', icon: UserPlus, label: () => t('auth.register'), action: 'open_sub' },
  ],
  lang: [
    { id: 'uk', icon: Languages, label: () => 'Українська', action: 'set_lang_uk' },
    { id: 'en', icon: Languages, label: () => 'English', action: 'set_lang_en' },
  ],
};

const hints = {
  'auth-login': 'Authenticate your Prism account to access full library features.',
  'auth-guest': 'Explore the library temporarily without an account.',
  'auth-register': 'Create a new account on this media server.',
  'lang-uk': 'Змінити мову інтерфейсу на українську.',
  'lang-en': 'Change interface language to English.',
};

const activeCatIndex = ref(0);
const activeItemIndex = ref(0);
const subItemOpen = ref(false);
const longHoverHint = ref('');

const activeCat = ref(categories[0].id);
const activeItem = ref<any>(items[activeCat.value as keyof typeof items][0]);

// Auth Form State
const email = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);
const formType = ref<'login' | 'register'>('login');

// Timers
let hoverTimer: any = null;

// Space between items in px
const H_SPACING = 160; 
const V_SPACING = 80;  

// ----------------------------------------------------------------------------
// LOGIC
// ----------------------------------------------------------------------------

watch(activeCatIndex, (newIdx) => {
  activeCat.value = categories[newIdx].id;
  activeItemIndex.value = 0; 
  updateActiveSelection();
});

watch(activeItemIndex, () => {
  updateActiveSelection();
});

const updateActiveSelection = () => {
  const currentItems = items[activeCat.value as keyof typeof items];
  activeItem.value = currentItems[activeItemIndex.value];
  
  longHoverHint.value = '';
  clearTimeout(hoverTimer);
  hoverTimer = setTimeout(() => {
    longHoverHint.value = (hints as any)[`${activeCat.value}-${activeItem.value.id}`] || '';
  }, 800);
};

// Keybindings specific for standard console remotes or keyboard
const handleKeydown = (e: KeyboardEvent) => {
  if (subItemOpen.value) {
    if (e.key === 'Escape' || e.key === 'Backspace') {
      subItemOpen.value = false;
      error.value = '';
    }
    return;
  }

  const currentItems = items[activeCat.value as keyof typeof items];

  if (e.key === 'ArrowRight') {
    if (activeCatIndex.value < categories.length - 1) activeCatIndex.value++;
  } else if (e.key === 'ArrowLeft') {
    if (activeCatIndex.value > 0) activeCatIndex.value--;
  } else if (e.key === 'ArrowDown') {
    if (activeItemIndex.value < currentItems.length - 1) activeItemIndex.value++;
  } else if (e.key === 'ArrowUp') {
    if (activeItemIndex.value > 0) activeItemIndex.value--;
  } else if (e.key === 'Enter') {
    handleItemAction();
  }
};

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
  updateActiveSelection();
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
  clearTimeout(hoverTimer);
});

// Handlers
const handleItemAction = async () => {
  if (activeItem.value.action === 'set_lang_uk') {
    locale.value = 'uk';
  } else if (activeItem.value.action === 'set_lang_en') {
    locale.value = 'en';
  } else if (activeItem.value.action === 'login_guest') {
    router.push({ name: 'home' }); 
  } else if (activeItem.value.action === 'open_sub') {
    formType.value = activeItem.value.id; // 'login' or 'register'
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

</script>

<template>
  <div class="h-screen w-screen bg-[#050505] overflow-hidden relative font-sans text-white/90">
    
    <!-- True XMB Dynamic Wave -->
    <!-- Two intersecting subtle plasma ribbons -->
    <div class="absolute inset-x-0 h-[300px] top-1/2 -translate-y-1/2 pointer-events-none -z-10 mix-blend-screen overflow-hidden opacity-30">
      <div class="absolute w-[200%] h-1 bg-white/40 left-[-50%] top-[40%] blur-[2px] transform rotate-[-3deg] shadow-[0_0_20px_10px_rgba(255,255,255,0.1)]"></div>
      <div class="absolute w-[200%] h-1 bg-white/20 left-[-50%] top-[50%] blur-[4px] transform rotate-[1deg] shadow-[0_0_30px_15px_rgba(255,255,255,0.1)]"></div>
    </div>

    <!-- The Cross Origin point (fixed offset to the left/top exactly like PS3 structure) -->
    <!-- Typically Top 30%, Left 25% -->
    <div 
      class="origin-point absolute" 
      style="left: 25%; top: 35%;"
    >
      
      <!-- HORIZONTAL AXIS: CATEGORIES -->
      <!-- Smoothly translates left/right. Dissolves inactive elements. -->
      <div 
        class="absolute flex items-center transition-transform duration-300 ease-out z-0"
        :style="{ transform: `translateX(calc(-${activeCatIndex * H_SPACING}px))` }"
        v-show="!subItemOpen"
      >
        <div 
          v-for="(cat, idx) in categories" 
          :key="cat.id"
          class="flex flex-col items-center justify-center transition-all duration-300 relative"
          :style="{ width: `${H_SPACING}px` }"
        >
          <!-- Category Icon 
               Moved slightly up permanently to make room for the active item crossing. -->
          <div 
            class="transition-all duration-300 absolute -top-16"
            :class="{
              'scale-110 opacity-100 text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.8)]': idx === activeCatIndex,
              'scale-90 opacity-40 text-gray-500': idx !== activeCatIndex
            }"
          >
            <component :is="cat.icon" :size="48" stroke-width="1.5" />
          </div>
          
          <span 
            class="absolute -top-24 text-[10px] tracking-widest uppercase font-bold transition-opacity duration-300 whitespace-nowrap"
            :class="idx === activeCatIndex ? 'opacity-50 text-white' : 'opacity-0'"
          >
            {{ cat.title }}
          </span>
        </div>
      </div>

      <!-- VERTICAL AXIS: ITEMS FOR ACTIVE CATEGORY -->
      <!-- Translates up/down through the origin point -->
      <!-- Hides instantly if subItemOpen is true -->
      <transition enter-active-class="transition-opacity duration-300" leave-active-class="transition-opacity duration-100" enter-from-class="opacity-0" leave-to-class="opacity-0">
        <div 
          v-if="!subItemOpen"
          class="absolute flex flex-col transition-transform duration-300 ease-out z-10"
          :style="{ 
            transform: `translate(calc(-${H_SPACING/2}px), calc(-${activeItemIndex * V_SPACING + (V_SPACING/2)}px))` 
          }"
        >
          <div 
            v-for="(item, idx) in items[activeCat as keyof typeof items]" 
            :key="item.id"
            class="flex items-center transition-all duration-300 w-[600px] cursor-pointer"
            :style="{ height: `${V_SPACING}px` }"
            @click="activeItemIndex = idx; handleItemAction()"
          >
            <!-- Highlight Box / Selection Effect (Subtle PS3 Style) -->
            <div 
              class="absolute left-[-20px] w-full h-[50px] bg-white/5 rounded-md pointer-events-none transition-opacity duration-300"
              :class="{ 'opacity-100': idx === activeItemIndex, 'opacity-0': idx !== activeItemIndex }"
              style="backdrop-filter: blur(2px);"
            ></div>

            <!-- Item Icon (Left-aligned relative to origin) -->
            <div 
              class="w-16 flex justify-center z-10"
              :class="{
                'opacity-100 scale-100 text-white': idx === activeItemIndex,
                'opacity-40 scale-90 text-gray-400': idx !== activeItemIndex
              }"
            >
              <component :is="item.icon" :size="32" stroke-width="1.5" />
            </div>

            <!-- Item Text -->
            <span 
              class="ml-6 z-10 transition-all text-2xl tracking-wide font-light whitespace-nowrap"
              :class="{
                'text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]': idx === activeItemIndex,
                'text-white/30 scale-95 origin-left': idx !== activeItemIndex
              }"
            >
              {{ item.label() }}
            </span>
          </div>
        </div>
      </transition>

      <!-- LONG HOVER HINT (Lower right corner replacement) -->
      <transition enter-active-class="transition-opacity duration-700" leave-active-class="transition-opacity duration-300" enter-from-class="opacity-0" leave-to-class="opacity-0">
        <div 
          v-if="longHoverHint && !subItemOpen" 
          class="absolute left-[80px] top-[40vh] text-md font-light text-white/60 tracking-wide w-[800px]"
        >
          {{ longHoverHint }}
        </div>
      </transition>

      <!-- SUB-ITEM COMPONENT (Renders exactly right of the cross origin) -->
      <transition enter-active-class="transition-all duration-300 ease-out delay-100" enter-from-class="opacity-0 translate-x-12 scale-95" leave-active-class="transition-all duration-200 ease-in" leave-to-class="opacity-0 translate-x-12 scale-95">
        <div 
          v-if="subItemOpen" 
          class="absolute flex flex-col items-start"
          style="left: 0; top: -30px;"
        >
          <!-- Parent Context Icon -->
          <div class="flex items-center gap-6 mb-12 opacity-80">
            <component :is="activeItem.icon" :size="32" stroke-width="1.5" class="drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]" />
            <span class="text-3xl font-light tracking-widest text-[#ececec] drop-shadow-[0_0_5px_rgba(255,255,255,0.6)]">{{ activeItem.label() }}</span>
          </div>

          <form @submit.prevent="handleAuthSubmit" class="w-[400px] flex flex-col gap-8 ml-[56px]">
            
            <div class="flex flex-col gap-1 relative">
              <label class="text-[11px] font-bold text-white/50 tracking-widest uppercase mb-1 flex items-center gap-2">
                <component :is="activeCat === 'auth' ? User : KeySquare" :size="14" />
                {{ t('auth.email') }}
              </label>
              <input 
                v-model="email" 
                type="email" 
                required
                class="w-full bg-black/40 border border-white/20 p-3 text-lg font-light text-white outline-none focus:border-white focus:bg-white/10 transition-colors shadow-inner"
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
                class="w-full bg-black/40 border border-white/20 p-3 text-lg font-light text-white outline-none focus:border-white focus:bg-white/10 transition-colors shadow-inner"
                placeholder="••••••••"
              />
            </div>

            <div v-if="error" class="text-red-400 text-[13px] font-light">{{ error }}</div>

            <div class="flex items-center gap-6 mt-6">
              <button 
                type="submit" 
                :disabled="loading"
                class="bg-[#e4e4e4] text-black px-8 py-3 font-semibold tracking-widest outline-none focus:bg-white focus:shadow-[0_0_20px_rgba(255,255,255,0.5)] hover:bg-white transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {{ loading ? t('common.loading') : 'ENTER' }}
                <ArrowRight :size="16" stroke-width="2" />
              </button>
              <button 
                type="button" 
                @click="subItemOpen = false"
                class="text-white/40 hover:text-white text-xs font-bold tracking-widest transition-colors uppercase cursor-pointer outline-none focus:text-white"
              >
                ESC Cancel
              </button>
            </div>
          </form>
        </div>
      </transition>

    </div> <!-- End Origin Point -->
    
    <!-- Footer Global Nav Hints -->
    <div class="absolute bottom-8 right-12 flex gap-6 text-[10px] tracking-[0.2em] font-bold text-white/30 uppercase">
       <span class="flex items-center gap-2"><ArrowUp :size="14" class="opacity-70"/><ArrowDown :size="14" class="opacity-70"/> Select</span>
       <span class="flex items-center gap-2"><ArrowLeft :size="14" class="opacity-70"/><ArrowRight :size="14" class="opacity-70"/> Expand</span>
       <span>Action (Enter)</span>
    </div>
  </div>
</template>

<style scoped>
/* Reset autocompletes to match the dark aesthetic strongly */
input:-webkit-autofill,
input:-webkit-autofill:hover, 
input:-webkit-autofill:focus, 
input:-webkit-autofill:active{
    -webkit-box-shadow: 0 0 0 30px #1a1a1a inset !important;
    -webkit-text-fill-color: white !important;
    transition: background-color 5000s ease-in-out 0s;
}
</style>

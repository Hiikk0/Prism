<script setup lang="ts">
import { ref, computed } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { 
  Folder, 
  Video, 
  Music, 
  Image as ImageIcon, 
  Settings, 
  LogOut, 
  User as UserIcon
} from 'lucide-vue-next';

const { t } = useI18n();
const authStore = useAuthStore();
const router = useRouter();

const categories = [
  { id: 'user', icon: UserIcon, label: 'Profile' },
  { id: 'video', icon: Video, label: 'Videos' },
  { id: 'music', icon: Music, label: 'Music' },
  { id: 'image', icon: ImageIcon, label: 'Photos' },
  { id: 'settings', icon: Settings, label: 'Settings' },
];

const activeCategoryIndex = ref(1); // Default to Video
const activeCategory = computed(() => categories[activeCategoryIndex.value]);

const handleLogout = async () => {
  await authStore.logout();
  router.push({ name: 'auth' });
};

const openFiles = (type: string) => {
  router.push({ name: 'files', query: { type } });
};
</script>

<template>
  <div class="h-screen w-screen overflow-hidden relative flex items-center justify-center">
    <!-- Sony XMB Background Wave (Simplified) -->
    <div class="absolute inset-0 bg-blue-900/10 pointer-events-none overflow-hidden -z-10">
      <div class="absolute top-1/2 left-0 right-0 h-96 bg-gradient-to-t from-blue-500/10 to-transparent -translate-y-1/2 blur-3xl opacity-20 animate-pulse"></div>
    </div>

    <!-- XMB Horizontal Navigation -->
    <div class="flex items-center gap-12 sm:gap-24 transition-transform duration-500" :style="{ transform: `translateX(${(1 - activeCategoryIndex) * 150}px)` }">
      <div 
        v-for="(cat, index) in categories" 
        :key="cat.id"
        class="xmb-nav-item flex flex-col items-center gap-4 transition-all duration-500"
        :class="{ 'scale-150 opacity-100 neon-text': index === activeCategoryIndex, 'opacity-40 scale-75': index !== activeCategoryIndex }"
        @click="activeCategoryIndex = index"
      >
        <component :is="cat.icon" :size="48" :stroke-width="1" class="drop-shadow-lg" />
        <span class="text-sm font-medium tracking-widest uppercase opacity-0 transition-opacity" :class="{ 'opacity-100': index === activeCategoryIndex }">
          {{ t(`categories.${cat.id}`) || cat.label }}
        </span>
      </div>
    </div>

    <!-- Category Sub-Items (Vertical List) -->
    <div 
      class="absolute left-1/2 top-[60%] sm:top-[65%] -translate-x-1/2 flex flex-col gap-4 text-center transition-all duration-500 opacity-0 transform translate-y-8"
      :class="{ 'opacity-100 translate-y-0': activeCategoryIndex >= 0 }"
      v-if="['video', 'music', 'image'].includes(activeCategory.id)"
    >
      <button 
        @click="openFiles(activeCategory.id)"
        class="group flex items-center gap-3 px-6 py-3 aero-card hover:translate-x-2 transition-all"
      >
        <Folder class="text-blue-400 group-hover:scale-110 transition-transform" />
        <span class="text-lg font-light tracking-wide">{{ t('files.browse_all') || 'Browse All' }}</span>
      </button>
      <button class="flex items-center gap-3 px-6 py-3 opacity-60 hover:opacity-100 hover:translate-x-2 transition-all">
        <span class="text-lg font-light">{{ t('files.recent') || 'Recently Added' }}</span>
      </button>
    </div>

    <!-- Footer Controls -->
    <div class="absolute bottom-12 right-12 flex items-center gap-8">
      <div class="flex flex-col items-end">
        <span class="text-xs font-bold tracking-widest text-blue-400/60 uppercase">User</span>
        <span class="text-lg font-light">{{ authStore.user?.email }}</span>
      </div>
      <button @click="handleLogout" class="p-3 aero-card text-red-400 hover:text-red-300">
        <LogOut :size="24" />
      </button>
    </div>

    <!-- Keyboard Navigation Hints -->
    <div class="absolute bottom-12 left-12 opacity-40 text-xs font-extralight tracking-widest">
      USE <span class="border border-white/20 px-1 rounded mx-1">LEFT / RIGHT</span> TO NAVIGATE
    </div>
  </div>
</template>

<style scoped>
.xmb-nav-item {
  min-width: 150px;
}
</style>

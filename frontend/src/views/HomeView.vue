<script setup lang="ts">
import { ref, computed } from 'vue';
import XmbContainer from '@/components/xmb/XmbContainer.vue';
import type { XmbItem } from '@/composables/useXmbNavigation';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { 
  Folder, 
  Video, 
  Music, 
  Image as ImageIcon, 
  Settings as SettingsIcon, 
  LogOut, 
  User as UserIcon,
  Globe,
  Monitor,
  Layout,
  Palette,
  Type,
  Key
} from 'lucide-vue-next';

const { t } = useI18n();
const authStore = useAuthStore();
const settingsStore = useSettingsStore();
const router = useRouter();

const categories = [
  { id: 'user', icon: UserIcon, label: 'Profile' },
  { id: 'settings', icon: SettingsIcon, label: 'Settings' },
  { id: 'video', icon: Video, label: 'Videos' },
  { id: 'music', icon: Music, label: 'Music' },
  { id: 'image', icon: ImageIcon, label: 'Photos' },
];

const activeCategoryIndex = ref(2); // Default to Video

// Map basic categories to full XMB Category structure
const xmbCategories = computed(() => categories.map(cat => {
  let items: any[] = [];
  
  if (['video', 'music', 'image'].includes(cat.id)) {
    items = [
      { id: `${cat.id}-all`, label: () => t('files.browse_all'), icon: Folder, type: cat.id },
      { id: `${cat.id}-recent`, label: () => t('files.recent'), icon: Folder, type: cat.id }
    ];
  } else if (cat.id === 'user') {
    items = [
      {
        id: 'user-profile',
        label: () => t('profile.view') || 'View Profile',
        icon: UserIcon,
        subItems: [
          {
            id: 'profile-name',
            label: () => t('auth.username') || 'Username',
            value: () => authStore.user?.email || 'Guest',
            onSelect: () => {}
          },
          {
            id: 'profile-role',
            label: () => 'Role',
            value: () => authStore.user?.role || 'user',
            onSelect: () => {}
          }
        ]
      },
      {
        id: 'user-change-name',
        label: () => t('profile.change_username') || 'Change Username',
        icon: Type,
        onSelect: () => { alert('Not implemented: Change Username'); }
      },
      {
        id: 'user-change-pass',
        label: () => t('profile.change_password') || 'Change Password',
        icon: Key,
        onSelect: () => { alert('Not implemented: Change Password'); }
      },
      {
        id: 'user-logout',
        label: () => t('auth.logout') || 'Logout',
        icon: LogOut,
        onSelect: () => handleLogout()
      }
    ];
  } else if (cat.id === 'settings') {
    items = [
      {
        id: 'settings-lang',
        label: () => t('settings.language') || 'Language',
        icon: Globe,
        subItems: settingsStore.availableLanguages.map(lang => ({
          id: lang.id,
          label: () => lang.label,
          value: () => settingsStore.language === lang.id ? '✓' : '',
          onSelect: () => { settingsStore.language = lang.id }
        }))
      },
      {
        id: 'settings-general',
        label: () => t('settings.general') || 'General Settings',
        icon: Monitor,
        subItems: [
          {
            id: 'gen-path',
            label: () => 'Media Path',
            value: () => settingsStore.mediaPath,
            onSelect: () => { 
              const newPath = prompt('Enter new media path:', settingsStore.mediaPath);
              if (newPath) settingsStore.mediaPath = newPath;
            }
          },
          {
            id: 'gen-guest',
            label: () => 'Guest Account',
            value: () => settingsStore.guestAccountEnabled ? 'ON' : 'OFF',
            onSelect: () => { settingsStore.guestAccountEnabled = !settingsStore.guestAccountEnabled }
          }
        ]
      },
      {
        id: 'settings-themes',
        label: () => t('settings.themes') || 'Themes',
        icon: Layout,
        subItems: settingsStore.availableThemes.map(theme => ({
          id: theme.id,
          label: () => theme.label,
          value: () => settingsStore.activeTheme === theme.label ? 'ACTIVE' : '',
          onSelect: () => { settingsStore.activeTheme = theme.label }
        }))
      },
      {
        id: 'settings-appearance',
        label: () => t('settings.appearance') || 'Appearance',
        icon: Palette,
        subItems: [
          {
            id: 'app-bg',
            label: () => 'Background',
            value: () => settingsStore.background,
            onSelect: () => { settingsStore.background = settingsStore.background === 'dynamic-wave' ? 'solid-blue' : 'dynamic-wave' }
          },
          {
            id: 'app-font',
            label: () => 'Font Color',
            icon: Type,
            value: () => settingsStore.fontColor,
            onSelect: () => { settingsStore.fontColor = settingsStore.fontColor === '#ffffff' ? '#e0f2fe' : '#ffffff' }
          }
        ]
      }
    ];
  }

  return {
    ...cat,
    title: t(`categories.${cat.id}`) || cat.label,
    items
  };
}));

const handleLogout = async () => {
  await authStore.logout();
  router.push({ name: 'auth' });
};

const openFiles = (item: any) => {
  if (item.onSelect) {
    item.onSelect();
  } else if (item.type) {
    router.push({ name: 'files', query: { type: item.type } });
  }
};
</script>

<template>
  <div class="h-screen w-screen overflow-hidden relative flex items-center justify-center bg-transparent">
    <!-- Sony XMB Dynamic Wave (Background layer) -->
    <div class="absolute inset-0 pointer-events-none z-[-2] overflow-hidden">
      <!-- Deep Radial Depth -->
      <div class="absolute inset-0 bg-radial-gradient from-blue-600/10 via-transparent to-transparent opacity-40 blur-[120px]"></div>
      
      <!-- Primary Wavy Lines -->
      <div class="absolute inset-x-0 h-[400px] top-1/2 -translate-y-1/2 mix-blend-screen opacity-60">
        <div class="absolute w-[200%] h-px bg-white/5 left-[-50%] top-[42%] blur-[0.5px] transform -rotate-1 shadow-[0_0_15px_5px_rgba(255,255,255,0.05)]"></div>
        <div class="absolute w-[200%] h-px bg-white/4 left-[-50%] top-[48%] blur-[1px] transform rotate-0.5 shadow-[0_0_20px_8px_rgba(255,255,255,0.04)] animate-wave-fast"></div>
        <div class="absolute w-[300%] h-px bg-white/2 -left-full top-[52%] blur-[2px] transform -rotate-0.5 shadow-[0_0_25px_10px_rgba(255,255,255,0.02)] animate-wave-slow-reverse"></div>
      </div>
    </div>

    <!-- NEW XMB Container -->
    <XmbContainer 
      :categories="xmbCategories"
      v-model:active-category="activeCategoryIndex"
      @select="(item: XmbItem) => openFiles(item)"
    />
  </div>
</template>

<style scoped>
.xmb-nav-item {
  min-width: 150px;
}
</style>

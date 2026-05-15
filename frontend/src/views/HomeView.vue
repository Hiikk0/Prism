<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
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
  Key,
  Play
} from 'lucide-vue-next';

const { t } = useI18n();
const authStore = useAuthStore();
const settingsStore = useSettingsStore();
const router = useRouter();

onMounted(async () => {
  if (authStore.user?.role === 'admin') {
    await settingsStore.fetchSystemSettings();
  }
});

const categories = [
  { id: 'user', icon: UserIcon },
  { id: 'settings', icon: SettingsIcon },
  { id: 'file-manager', icon: Folder },
  { id: 'player', icon: Play },
];

const activeCategoryIndex = ref(2); // Default to File Manager

// Map basic categories to full XMB Category structure
const xmbCategories = computed(() => categories.map(cat => {
  let items: XmbItem[] = [];
  
  if (cat.id === 'file-manager') {
    items = [
      { id: 'files-all', label: () => t('files.all') || 'All Files', icon: Folder, type: 'all' },
      { id: 'files-video', label: () => t('categories.video') || 'Videos', icon: Video, type: 'video' },
      { id: 'files-music', label: () => t('categories.music') || 'Music', icon: Music, type: 'audio' },
      { id: 'files-photo', label: () => t('categories.image') || 'Photos', icon: ImageIcon, type: 'image' },
    ];
  } else if (cat.id === 'player') {
    items = [
      { id: 'player-recent', label: () => t('player.recent') || 'Recently Added', icon: Folder, type: 'recent' },
      { id: 'player-playlists', label: () => t('player.playlists') || 'Playlists', icon: Folder, type: 'playlists' },
      { id: 'player-continue', label: () => t('player.continue') || 'Continue Watching', icon: Play, type: 'continue' },
    ];
  } else if (cat.id === 'user') {
    const baseItems: XmbItem[] = [
      {
        id: 'user-profile',
        label: () => t('profile.view') || 'View Profile',
        icon: UserIcon,
        subItems: [
          {
            id: 'profile-name',
            label: () => t('auth.username') || 'Username',
            value: () => authStore.user?.role === 'guest' ? (t('auth.guest') || 'Guest') : (authStore.user?.username || 'Guest'),
            onSelect: () => {}
          },
          {
            id: 'profile-role',
            label: () => 'Role',
            value: () => authStore.user?.role || 'user',
            onSelect: () => {}
          }
        ]
      }
    ];

    if (authStore.user?.role !== 'guest') {
      baseItems.push(
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
        }
      );
    }

    baseItems.push({
      id: 'user-logout',
      label: () => t('auth.logout') || 'Logout',
      icon: LogOut,
      onSelect: () => handleLogout()
    });

    items = baseItems;
  } else if (cat.id === 'settings') {
    const baseSettings: XmbItem[] = [
      {
        id: 'settings-lang',
        label: () => t('settings.language') || 'Language',
        icon: Globe,
        subItems: settingsStore.availableLanguages.map((lang: { id: string, label: string }) => ({
          id: lang.id,
          label: () => lang.label,
          value: () => settingsStore.language === lang.id ? '✓' : '',
          onSelect: () => { settingsStore.language = lang.id }
        }))
      },
      {
        id: 'settings-appearance',
        label: () => t('settings.appearance') || 'Appearance',
        icon: Palette,
        subItems: [
          {
            id: 'app-bg-type',
            label: () => 'Background Type',
            value: () => authStore.user?.preferences?.backgroundType || 'waves',
            onSelect: async () => {
              const types = ['waves', 'image', 'video', 'none'] as const;
              const current = authStore.user?.preferences?.backgroundType || 'waves';
              const nextIdx = (types.indexOf(current as any) + 1) % types.length;
              await authStore.updateProfile({ 
                preferences: { 
                  backgroundType: types[nextIdx],
                  backgroundMediaId: authStore.user?.preferences?.backgroundMediaId || '',
                  performanceMode: authStore.user?.preferences?.performanceMode || 'high'
                } 
              });
            }
          },
          {
            id: 'app-bg-media',
            label: () => 'Background Media URL',
            value: () => authStore.user?.preferences?.backgroundMediaId ? 'SET' : 'NONE',
            onSelect: async () => {
              const url = prompt('Enter Background Image/Video URL:', authStore.user?.preferences?.backgroundMediaId || '');
              if (url !== null) {
                await authStore.updateProfile({ 
                  preferences: { 
                    backgroundType: authStore.user?.preferences?.backgroundType || 'waves',
                    backgroundMediaId: url,
                    performanceMode: authStore.user?.preferences?.performanceMode || 'high'
                  } 
                });
              }
            }
          },
          {
            id: 'app-perf',
            label: () => 'Performance Mode',
            value: () => authStore.user?.preferences?.performanceMode || 'high',
            onSelect: async () => {
              const mode = authStore.user?.preferences?.performanceMode === 'low' ? 'high' : 'low';
              await authStore.updateProfile({ 
                preferences: { 
                  backgroundType: authStore.user?.preferences?.backgroundType || 'waves',
                  backgroundMediaId: authStore.user?.preferences?.backgroundMediaId || '',
                  performanceMode: mode
                } 
              });
            }
          }
        ]
      }
    ];

    if (authStore.user?.role === 'admin') {
      baseSettings.push({
        id: 'settings-general',
        label: () => t('settings.general') || 'General Settings',
        icon: Monitor,
        subItems: [
          {
            id: 'gen-path',
            label: () => 'Media Path',
            value: () => settingsStore.mediaPath,
            onSelect: async () => { 
              if (authStore.user?.role !== 'admin') return;
              const newPath = prompt('Enter new media path:', settingsStore.mediaPath);
              if (newPath) await settingsStore.updateSystemSettings({ mediaRootDirectory: newPath });
            }
          },
          {
            id: 'gen-scan-limit',
            label: () => 'Scanner Concurrency',
            value: () => settingsStore.scannerConcurrency.toString(),
            onSelect: async () => {
              const limit = prompt('Parallel file processing limit (1-8):', settingsStore.scannerConcurrency.toString());
              if (limit) await settingsStore.updateSystemSettings({ scannerConcurrency: parseInt(limit) });
            }
          },
          {
            id: 'gen-guest',
            label: () => 'Guest Account',
            value: () => settingsStore.guestAccountEnabled ? 'ON' : 'OFF',
            onSelect: async () => { 
              if (authStore.user?.role !== 'admin') return;
              await settingsStore.updateSystemSettings({ guestLoginEnabled: !settingsStore.guestAccountEnabled });
            }
          }
        ]
      });
    }

    baseSettings.push(
      {
        id: 'settings-themes',
        label: () => t('settings.themes') || 'Themes',
        icon: Layout,
        subItems: settingsStore.availableThemes.map((theme: { id: string, label: string }) => ({
          id: theme.id,
          label: () => theme.label,
          value: () => settingsStore.activeTheme === theme.label ? 'ACTIVE' : '',
          onSelect: () => { settingsStore.activeTheme = theme.label }
        }))
      }
    );

    items = baseSettings;
  }

  return {
    ...cat,
    title: t(`categories.${cat.id}`),
    items
  };
}));

const handleLogout = async () => {
  await authStore.logout();
  router.push({ name: 'auth' });
};

const openFiles = (item: XmbItem) => {
  if (item.onSelect) {
    item.onSelect();
  } else if (item.type) {
    if (['recent', 'playlists', 'continue'].includes(item.type)) {
      router.push({ name: 'player-lists', params: { type: item.type } });
    } else {
      router.push({ name: 'files', query: { type: item.type } });
    }
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

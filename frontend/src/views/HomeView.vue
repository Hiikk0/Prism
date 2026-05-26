<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import XmbContainer from '@/components/xmb/XmbContainer.vue';
import type { XmbItem } from '@/composables/useXmbNavigation';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import FilePickerModal from '@/components/common/FilePickerModal.vue';
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
  Play,
  ArrowRight
} from 'lucide-vue-next';

const { t } = useI18n();
const authStore = useAuthStore();
const settingsStore = useSettingsStore();
const router = useRouter();

const prefs = computed(() => authStore.user?.preferences || {
  backgroundType: 'waves' as const,
  performanceMode: 'high' as const,
  backgroundMediaId: ''
});

const showCssWaves = computed(() => {
  return prefs.value.backgroundType === 'waves' && prefs.value.performanceMode === 'high';
});

const showFilePicker = ref(false);
const filePickerType = ref<'image' | 'video'>('image');

const newUsername = ref('');
const changeUsernameError = ref('');
const changingUsername = ref(false);

const newPassword = ref('');
const confirmNewPassword = ref('');
const changePasswordError = ref('');
const changingPassword = ref(false);

const xmbRef = ref<any>(null);

const handleChangeUsername = async () => {
  if (!newUsername.value) {
    changeUsernameError.value = t('auth.username_required') || 'Username is required';
    return;
  }
  if (newUsername.value.length < 3) {
    changeUsernameError.value = t('auth.username_too_short') || 'Must be at least 3 characters';
    return;
  }

  changingUsername.value = true;
  changeUsernameError.value = '';
  try {
    await authStore.updateProfile({ username: newUsername.value });
    newUsername.value = '';
    xmbRef.value?.closeSubMenuCompletely();
  } catch (err: any) {
    changeUsernameError.value = err.response?.data?.error || 'Error updating username';
  } finally {
    changingUsername.value = false;
  }
};

const handleChangePassword = async () => {
  if (!newPassword.value) {
    changePasswordError.value = t('auth.password_required') || 'Password is required';
    return;
  }
  if (newPassword.value.length < 6) {
    changePasswordError.value = t('auth.password_too_short') || 'Must be at least 6 characters';
    return;
  }
  if (newPassword.value !== confirmNewPassword.value) {
    changePasswordError.value = t('auth.password_mismatch') || 'Passwords do not match';
    return;
  }

  changingPassword.value = true;
  changePasswordError.value = '';
  try {
    await authStore.updateProfile({ password: newPassword.value });
    newPassword.value = '';
    confirmNewPassword.value = '';
    xmbRef.value?.closeSubMenuCompletely();
  } catch (err: any) {
    changePasswordError.value = err.response?.data?.error || 'Error updating password';
  } finally {
    changingPassword.value = false;
  }
};

const handleBackgroundSelected = async (file: any) => {
  showFilePicker.value = false;
  await authStore.updateProfile({ 
    preferences: { 
      backgroundType: authStore.user?.preferences?.backgroundType || 'waves',
      backgroundMediaId: file._id,
      performanceMode: authStore.user?.preferences?.performanceMode || 'high'
    } 
  });
};

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
            label: () => t('profile.role') || 'Role',
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
          subItems: [
            {
              id: 'change-username-val',
              label: () => t('profile.new_username') || 'New Username',
              value: () => newUsername.value,
              type: 'text' as const,
              onUpdate: (val: string) => { newUsername.value = val; }
            },
            {
              id: 'change-username-submit',
              label: () => t('common.submit') || 'Submit',
              icon: ArrowRight,
              type: 'action' as const,
              value: () => changeUsernameError.value || (changingUsername.value ? t('common.loading') : ''),
              onSelect: () => handleChangeUsername()
            }
          ]
        },
        {
          id: 'user-change-pass',
          label: () => t('profile.change_password') || 'Change Password',
          icon: Key,
          subItems: [
            {
              id: 'change-password-val',
              label: () => t('profile.new_password') || 'New Password',
              value: () => newPassword.value,
              type: 'password' as const,
              onUpdate: (val: string) => { newPassword.value = val; }
            },
            {
              id: 'change-password-confirm',
              label: () => t('auth.confirm_password') || 'Confirm Password',
              value: () => confirmNewPassword.value,
              type: 'password' as const,
              onUpdate: (val: string) => { confirmNewPassword.value = val; }
            },
            {
              id: 'change-password-submit',
              label: () => t('common.submit') || 'Submit',
              icon: ArrowRight,
              type: 'action' as const,
              value: () => changePasswordError.value || (changingPassword.value ? t('common.loading') : ''),
              onSelect: () => handleChangePassword()
            }
          ]
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
            label: () => t('settings.background_type') || 'Background Type',
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
            label: () => t('settings.background_media') || 'Background Media',
            value: () => authStore.user?.preferences?.backgroundMediaId ? 'SET' : 'NONE',
            onSelect: async () => {
              const bgType = authStore.user?.preferences?.backgroundType || 'waves';
              if (bgType === 'waves' || bgType === 'none') {
                alert(t('settings.select_media_type_first') || 'Please set Background Type to Image or Video first!');
                return;
              }
              filePickerType.value = bgType as 'image' | 'video';
              showFilePicker.value = true;
            }
          },
          {
            id: 'app-perf',
            label: () => t('settings.performance_mode') || 'Performance Mode',
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
            label: () => t('settings.media_path') || 'Media Path',
            value: () => settingsStore.mediaPath,
            onSelect: async () => { 
              if (authStore.user?.role !== 'admin') return;
              const newPath = prompt(t('settings.enter_media_path') || 'Enter new media path:', settingsStore.mediaPath);
              if (newPath) await settingsStore.updateSystemSettings({ mediaRootDirectory: newPath });
            }
          },
          {
            id: 'gen-scan-limit',
            label: () => t('settings.scanner_concurrency') || 'Scanner Concurrency',
            value: () => settingsStore.scannerConcurrency.toString(),
            onSelect: async () => {
              const limit = prompt(t('settings.enter_concurrency_limit') || 'Parallel file processing limit (1-8):', settingsStore.scannerConcurrency.toString());
              if (limit) await settingsStore.updateSystemSettings({ scannerConcurrency: parseInt(limit) });
            }
          },
          {
            id: 'gen-guest',
            label: () => t('settings.guest_account') || 'Guest Account',
            value: () => settingsStore.guestAccountEnabled ? 'ON' : 'OFF',
            onSelect: async () => { 
              if (authStore.user?.role !== 'admin') return;
              await settingsStore.updateSystemSettings({ guestLoginEnabled: !settingsStore.guestAccountEnabled });
            }
          },
          {
            id: 'gen-transcode',
            label: () => t('settings.transcode_mode') || 'Transcoding Mode',
            value: () => settingsStore.transcodeMode,
            onSelect: async () => {
              const modes: Array<'JIT' | 'DISK' | 'OFF'> = ['JIT', 'DISK', 'OFF'];
              const currentIdx = modes.indexOf(settingsStore.transcodeMode);
              const nextMode = modes[(currentIdx + 1) % modes.length];
              await settingsStore.updateSystemSettings({ transcodeMode: nextMode });
            }
          },
          {
            id: 'gen-encoder',
            label: () => t('settings.hardware_encoder') || 'Hardware Encoder',
            value: () => settingsStore.hardwareEncoder,
            onSelect: async () => {
              const encoders = ['cpu_h264', 'cpu_h265', 'cpu_av1', 'cpu_vp9', 'nvenc', 'amf', 'qsv', 'videotoolbox'];
              const currentIdx = encoders.indexOf(settingsStore.hardwareEncoder);
              const nextEncoder = encoders[(currentIdx + 1) % encoders.length];
              await settingsStore.updateSystemSettings({ hardwareEncoder: nextEncoder });
            }
          },
          {
            id: 'gen-keep-jit',
            label: () => t('settings.keep_jit_cache') || 'Keep JIT Resume Cache',
            value: () => settingsStore.keepJitResumeCache ? 'ON' : 'OFF',
            onSelect: async () => {
              if (authStore.user?.role !== 'admin') return;
              await settingsStore.updateSystemSettings({ keepJitResumeCache: !settingsStore.keepJitResumeCache });
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
    <div v-if="showCssWaves" class="absolute inset-0 pointer-events-none z-[-2] overflow-hidden">
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
      ref="xmbRef"
      :categories="xmbCategories"
      v-model:active-category="activeCategoryIndex"
      @select="(item: XmbItem) => openFiles(item)"
    />

    <!-- File Picker Modal for custom background media selection -->
    <FilePickerModal
      :show="showFilePicker"
      :title="filePickerType === 'image' ? 'Оберіть Фото для фону' : 'Оберіть Відео для фону'"
      :type="filePickerType"
      @close="showFilePicker = false"
      @select="handleBackgroundSelected"
    />
  </div>
</template>

<style scoped>
.xmb-nav-item {
  min-width: 150px;
}
</style>

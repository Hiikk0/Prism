import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import i18n from '@/i18n';
import api from '@/api/api';
import type { UpdateSettingsPayload, GpuDeviceInfo } from '@/types/api';

export const useSettingsStore = defineStore('settings', () => {
  // Localization
  const language = ref(localStorage.getItem('prism_language') || i18n.global.locale);
  
  // General (Local Preferences)
  const activeTheme = ref(localStorage.getItem('prism_theme') || 'Classic');
  const background = ref(localStorage.getItem('prism_background') || 'dynamic-wave');
  const fontColor = ref(localStorage.getItem('prism_font_color') || '#ffffff');

  // System Settings (Backend Sync)
  const mediaPath = ref('C:\\Media');
  const registrationEnabled = ref(true);
  const guestAccountEnabled = ref(true);
  const usePolling = ref(false);
  const pollingInterval = ref(100);
  const scannerConcurrency = ref(2);
  const scannerIoConcurrency = ref(10);
  const transcodeMode = ref<'JIT' | 'DISK' | 'OFF'>('OFF');
  const hardwareEncoder = ref<string>('cpu_h264');
  const gpuConfig = ref({
    encoderType: 'auto',
    codecType: 'auto',
    multiGpuPool: true,
    preferredDevice: 'auto',
    previewConcurrency: 1,
  });
  const targetQualities = ref<number[]>([1080, 720, 480]);
  const keepJitResumeCache = ref(false);
  const loading = ref(false);
  const gpus = ref<GpuDeviceInfo[]>([]);

  // Fetch from backend
  const fetchSystemSettings = async () => {
    loading.value = true;
    try {
      const { data } = await api.get('/admin/settings');
      mediaPath.value = data.mediaRootDirectory;
      registrationEnabled.value = data.registrationEnabled;
      guestAccountEnabled.value = data.guestLoginEnabled;
      usePolling.value = data.usePolling;
      pollingInterval.value = data.pollingInterval;
      scannerConcurrency.value = data.scannerConcurrency;
      scannerIoConcurrency.value = data.scannerIoConcurrency;
      transcodeMode.value = data.transcodeMode || 'OFF';
      hardwareEncoder.value = data.hardwareEncoder || 'cpu_h264';
      if (data.gpuConfig) gpuConfig.value = data.gpuConfig;
      targetQualities.value = data.targetQualities || [1080, 720, 480];
      keepJitResumeCache.value = !!data.keepJitResumeCache;
    } catch (err) {
      console.warn('Failed to fetch system settings');
    } finally {
      loading.value = false;
    }
  };

  const fetchPublicSettings = async () => {
    try {
      const { data } = await api.get('/auth/settings');
      registrationEnabled.value = data.registrationEnabled;
      guestAccountEnabled.value = data.guestLoginEnabled;
      transcodeMode.value = data.transcodeMode || 'OFF';
      hardwareEncoder.value = data.hardwareEncoder || 'cpu_h264';
      targetQualities.value = data.targetQualities || [1080, 720, 480];
    } catch (err) {
      console.warn('Failed to fetch public settings');
    }
  };

  const fetchGpus = async () => {
    try {
      const { data } = await api.get('/admin/settings/gpus');
      gpus.value = data;
    } catch (err) {
      console.error('Failed to fetch GPUs', err);
    }
  };

  // Update backend
  const updateSystemSettings = async (payload: UpdateSettingsPayload) => {
    loading.value = true;
    try {
      const { data } = await api.patch('/admin/settings', payload);
      if (data.mediaRootDirectory !== undefined) mediaPath.value = data.mediaRootDirectory;
      if (data.registrationEnabled !== undefined) registrationEnabled.value = data.registrationEnabled;
      if (data.guestLoginEnabled !== undefined) guestAccountEnabled.value = data.guestLoginEnabled;
      if (data.usePolling !== undefined) usePolling.value = data.usePolling;
      if (data.pollingInterval !== undefined) pollingInterval.value = data.pollingInterval;
      if (data.scannerConcurrency !== undefined) scannerConcurrency.value = data.scannerConcurrency;
      if (data.scannerIoConcurrency !== undefined) scannerIoConcurrency.value = data.scannerIoConcurrency;
      if (data.transcodeMode !== undefined) transcodeMode.value = data.transcodeMode;
      if (data.hardwareEncoder !== undefined) hardwareEncoder.value = data.hardwareEncoder;
      if (data.gpuConfig !== undefined) gpuConfig.value = data.gpuConfig;
      if (data.targetQualities !== undefined) targetQualities.value = data.targetQualities;
      if (data.keepJitResumeCache !== undefined) keepJitResumeCache.value = data.keepJitResumeCache;
    } catch (err) {
      console.error('Failed to update system settings');
      throw err;
    } finally {
      loading.value = false;
    }
  };

  // Watchers for local persistence
  watch(language, (newVal) => {
    localStorage.setItem('prism_language', newVal);
    (i18n.global.locale as any).value = newVal;
  });

  watch(activeTheme, (newVal) => {
    localStorage.setItem('prism_theme', newVal);
  });

  watch(background, (newVal) => {
    localStorage.setItem('prism_background', newVal);
  });

  watch(fontColor, (newVal) => {
    localStorage.setItem('prism_font_color', newVal);
  });

  const availableLanguages = [
    { id: 'en', label: 'English' },
    { id: 'uk', label: 'Українська' }
  ];

  const availableThemes = [
    { id: 'classic', label: 'Classic' },
    { id: 'modern', label: 'Modern' },
    { id: 'dark', label: 'Deep Blue' }
  ];

  return {
    language,
    mediaPath,
    registrationEnabled,
    guestAccountEnabled,
    usePolling,
    pollingInterval,
    scannerConcurrency,
    scannerIoConcurrency,
    transcodeMode,
    hardwareEncoder,
    gpuConfig,
    targetQualities,
    keepJitResumeCache,
    activeTheme,
    background,
    fontColor,
    availableLanguages,
    availableThemes,
    loading,
    gpus,
    fetchSystemSettings,
    fetchPublicSettings,
    fetchGpus,
    updateSystemSettings
  };
});

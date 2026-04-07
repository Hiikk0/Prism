import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import i18n from '@/i18n';
import api from '@/api/api';

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
  const loading = ref(false);

  // Fetch from backend
  const fetchSystemSettings = async () => {
    loading.value = true;
    try {
      const { data } = await api.get('/admin/settings');
      mediaPath.value = data.mediaRootDirectory;
      registrationEnabled.value = data.registrationEnabled;
      guestAccountEnabled.value = data.guestLoginEnabled;
    } catch (err) {
      console.warn('Failed to fetch system settings');
    } finally {
      loading.value = false;
    }
  };

  // Update backend
  const updateSystemSettings = async (payload: any) => {
    loading.value = true;
    try {
      const { data } = await api.patch('/admin/settings', payload);
      if (data.mediaRootDirectory !== undefined) mediaPath.value = data.mediaRootDirectory;
      if (data.registrationEnabled !== undefined) registrationEnabled.value = data.registrationEnabled;
      if (data.guestLoginEnabled !== undefined) guestAccountEnabled.value = data.guestLoginEnabled;
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
    activeTheme,
    background,
    fontColor,
    availableLanguages,
    availableThemes,
    loading,
    fetchSystemSettings,
    updateSystemSettings
  };
});

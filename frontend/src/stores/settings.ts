import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import i18n from '@/i18n';

export const useSettingsStore = defineStore('settings', () => {
  // Localization
  const language = ref(localStorage.getItem('prism_language') || i18n.global.locale);
  
  // General
  const mediaPath = ref(localStorage.getItem('prism_media_path') || 'C:\\Media');
  const guestAccountEnabled = ref(localStorage.getItem('prism_guest_account') !== 'false'); // Default true
  
  // Themes & Appearance
  const activeTheme = ref(localStorage.getItem('prism_theme') || 'Classic');
  const background = ref(localStorage.getItem('prism_background') || 'dynamic-wave');
  const fontColor = ref(localStorage.getItem('prism_font_color') || '#ffffff');

  // Watchers for persistence
  watch(language, (newVal) => {
    localStorage.setItem('prism_language', newVal);
    (i18n.global.locale as any).value = newVal;
  });

  watch(mediaPath, (newVal) => {
    localStorage.setItem('prism_media_path', newVal);
  });

  watch(guestAccountEnabled, (newVal) => {
    localStorage.setItem('prism_guest_account', String(newVal));
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
    guestAccountEnabled,
    activeTheme,
    background,
    fontColor,
    availableLanguages,
    availableThemes
  };
});

import { createI18n } from 'vue-i18n';

const messages = {
  en: {
    common: {
      loading: 'Loading...'
    },
    auth: {
      login: 'Login',
      register: 'Register',
      username: 'Username',
      password: 'Password',
      confirm_password: 'Confirm Password',
      logout: 'Logout',
      have_account: 'Already have an account?',
      no_account: 'Don\'t have an account?',
      password_mismatch: 'Passwords do not match',
      error_generic: 'An error occurred.'
    },
    files: {
      title: 'Media Files',
      upload: 'Upload File',
      delete: 'Delete',
      rename: 'Rename',
      browse_all: 'Browse All',
      recent: 'Recently Added',
      empty: 'No files found'
    },
    settings: {
      language: 'Language',
      general: 'General Settings',
      themes: 'Themes',
      appearance: 'Appearance'
    },
    categories: {
      user: 'Profile',
      settings: 'Settings',
      video: 'Videos',
      music: 'Music',
      image: 'Photos'
    },
    profile: {
      view: 'View Profile',
      change_username: 'Change Username',
      change_password: 'Change Password'
    }
  },
  uk: {
    common: {
      loading: 'Завантаження...'
    },
    auth: {
      login: 'Увійти',
      register: 'Реєстрація',
      username: 'Ім\'я користувача',
      password: 'Пароль',
      confirm_password: 'Підтвердження пароля',
      logout: 'Вийти',
      have_account: 'Вже маєте акаунт?',
      no_account: 'Немає акаунту?',
      password_mismatch: 'Паролі не співпадають',
      error_generic: 'Виникла помилка.'
    },
    files: {
      title: 'Медіафайли',
      upload: 'Завантажити файл',
      delete: 'Видалити',
      rename: 'Перейменувати',
      browse_all: 'Переглянути всі',
      recent: 'Нещодавно додані',
      empty: 'Файлів не знайдено'
    },
    settings: {
      language: 'Мова',
      general: 'Загальні налаштування',
      themes: 'Теми',
      appearance: 'Вигляд'
    },
    categories: {
      user: 'Профіль',
      settings: 'Налаштування',
      video: 'Відео',
      music: 'Музика',
      image: 'Фото'
    },
    profile: {
      view: 'Переглянути профіль',
      change_username: 'Змінити ім\'я',
      change_password: 'Змінити пароль'
    }
  },
};

const i18n = createI18n({
  locale: 'uk', // за замовчуванням українська
  fallbackLocale: 'en',
  messages,
});

export default i18n;

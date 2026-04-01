import { createI18n } from 'vue-i18n';

const messages = {
  en: {
    common: {
      loading: 'Loading...'
    },
    auth: {
      login: 'Login',
      register: 'Register',
      email: 'Email',
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
  },
  uk: {
    common: {
      loading: 'Завантаження...'
    },
    auth: {
      login: 'Увійти',
      register: 'Реєстрація',
      email: 'Електронна пошта',
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
  },
};

const i18n = createI18n({
  locale: 'uk', // за замовчуванням українська
  fallbackLocale: 'en',
  messages,
});

export default i18n;

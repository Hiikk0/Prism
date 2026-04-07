import { createI18n } from 'vue-i18n';

const messages = {
  en: {
    common: {
      loading: 'Loading...',
      search: 'Search...'
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
      error_generic: 'An error occurred.',
      guest: 'Guest'
    },
    files: {
      title: 'Media Files',
      root: 'Storage',
      all: 'All Files',
      upload: 'Upload File',
      delete: 'Delete',
      rename: 'Rename',
      browse_all: 'Browse All',
      recent: 'Recently Added',
      empty: 'No files found',
      search: 'Search everything...',
      properties: 'Properties',
      type: 'Type',
      size: 'Size',
      uploaded: 'Uploaded',
      tags: 'Tags',
      no_tags: 'No virtual tags assigned',
      open_folder: 'Open Folder',
      preview_file: 'Preview File',
      new_folder: 'New Folder',
      toggle_layout: 'Toggle Layout',
      multi_select: 'Multi-select (Square)',
      file_info: 'File Info (Select)',
      move: 'Move (Triangle)',
      tag_edit: 'Tag',
      selected: 'Selected',
      select_file_info: 'Select a file to view properties',
      enter_folder_name: 'Enter folder name:',
      confirm_delete: 'Are you sure you want to delete {count} item(s)?',
      rename_item: 'Enter new name:',
      scan_directory: 'Scan Directory',
      scanning: 'Scanning...',
      manage_tags: 'Manage Tags'
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
      'file-manager': 'File Manager',
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
      loading: 'Завантаження...',
      search: 'Пошук...'
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
      error_generic: 'Виникла помилка.',
      guest: 'Гість'
    },
    files: {
      title: 'Медіафайли',
      root: 'Сховище',
      all: 'Всі файли',
      upload: 'Завантажити файл',
      delete: 'Видалити',
      rename: 'Перейменувати',
      browse_all: 'Переглянути всі',
      recent: 'Нещодавно додані',
      empty: 'Файлів не знайдено',
      search: 'Пошук усюди...',
      properties: 'Властивості',
      type: 'Тип',
      size: 'Розмір',
      uploaded: 'Завантажено',
      tags: 'Теги',
      no_tags: 'Віртуальних тегів не призначено',
      open_folder: 'Відкрити папку',
      preview_file: 'Перегляд файлу',
      new_folder: 'Нова папка',
      toggle_layout: 'Перемкнути вигляд',
      multi_select: 'Множинний вибір (Квадрат)',
      file_info: 'Інфо про файл (Select)',
      move: 'Перемістити (Трикутник)',
      tag_edit: 'Тег',
      selected: 'Вибрано',
      select_file_info: 'Оберіть файл для перегляду властивостей',
      enter_folder_name: 'Введіть назву папки:',
      confirm_delete: 'Ви впевнені, що хочете видалити {count} елемент(ів)?',
      rename_item: 'Введіть нову назву:',
      scan_directory: 'Сканувати директорію',
      scanning: 'Сканування...',
      manage_tags: 'Керувати тегами'
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
      'file-manager': 'Файловий менеджер',
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
  legacy: false,
  locale: 'uk', // за замовчуванням українська
  fallbackLocale: 'en',
  messages,
});

export default i18n;

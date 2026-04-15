import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue', '**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        project: ['./tsconfig.app.json', './tsconfig.node.json'],
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.vue'],
        sourceType: 'module',
      },
    },
    rules: {
      // Маркуємо 'any' як попередження
      '@typescript-eslint/no-explicit-any': 'warn',
      
      // Маркуємо небезпечні операції (потребує type-aware linting)
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      
      // Попередження для //@ts-ignore та інших коментарів
      '@typescript-eslint/ban-ts-comment': 'warn',

      // Vue специфічні правила
      'vue/multi-word-component-names': 'off',
    },
  },
  {
    // Ігноруємо дистаційні та згенеровані файли
    ignores: ['dist/**', 'node_modules/**', 'public/**', 'eslint.config.js', 'vite.config.ts'],
  }
);

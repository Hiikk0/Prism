import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Маркуємо 'any' як попередження
      '@typescript-eslint/no-explicit-any': 'warn',
      
      // Маркуємо небезпечні операції (потребує parserOptions.project)
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      
      // Попередження для //@ts-ignore та інших коментарів
      '@typescript-eslint/ban-ts-comment': 'warn',
    },
  },
  {
    // Ігноруємо дистаційні та згенеровані файли
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'eslint.config.mjs', 'jest.config.js'],
  }
);

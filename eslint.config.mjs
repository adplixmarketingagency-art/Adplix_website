import js from '@eslint/js'
import react from 'eslint-plugin-react'
import globals from 'globals'
import tseslint from 'typescript-eslint'

const source = [
  'src/**/*.{js,mjs,jsx,ts,tsx}',
  'portal/**/*.{js,mjs}',
  'scripts/**/*.{js,mjs}',
  'tests/**/*.{js,mjs}',
  'vite.config.js',
  'eslint.config.mjs',
]
const typed = ['**/*.{ts,tsx}']

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.worker-dist/**',
      '**/.portal-dist/**',
      '**/.portal-local/**',
      '**/.wrangler/**',
      '**/.vite/**',
      '**/.cloudflare/**',
      '**/.opencode/**',
      '**/.claude/**',
      '**/.omnirush/**',
      'projects/**',
      'assets/**',
      'archive/**',
    ],
  },
  {
    files: source,
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } } },
    rules: { ...js.configs.recommended.rules },
  },
  ...tseslint.configs.recommended.map((config) => ({ ...config, files: typed })),
  {
    files: ['**/*.{jsx,tsx}'],
    plugins: { react },
    rules: { 'react/jsx-uses-vars': 'error', 'react/jsx-uses-react': 'error' },
  },
  {
    files: ['src/index.js', 'src/portal/**/*.{js,mjs}', 'src/security-headers.mjs'],
    languageOptions: { globals: globals.serviceworker },
  },
  {
    files: ['portal/sw.js'],
    languageOptions: { globals: globals.serviceworker },
  },
  {
    files: [
      'portal/**/*.{js,mjs}',
      'src/**/*.{jsx,tsx}',
      'src/components/**/*.{js,ts}',
      'src/lib/**/*.ts',
      'scripts/{main,navigation}.js',
      'tests/*.e2e.mjs',
      'tests/portal-photo-browser.mjs',
    ],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['scripts/main.js'],
    languageOptions: { globals: { emailjs: 'readonly' } },
  },
  {
    files: ['tests/**/*.{js,mjs}', 'scripts/**/*.mjs', 'vite.config.js', 'eslint.config.mjs'],
    languageOptions: { globals: globals.node },
  },
  {
    files: typed,
    rules: { 'no-undef': 'off', 'no-unused-vars': 'off' },
  },
]

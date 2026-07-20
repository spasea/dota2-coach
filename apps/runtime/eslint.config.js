import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    name: 'global ignores',
    ignores: ['coverage/**', 'dist/**'],
  },
  {
    name: 'lint directives',
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
      reportUnusedInlineConfigs: 'error',
    },
  },
  {
    name: 'javascript configuration',
    files: ['**/*.js'],
    extends: [js.configs.recommended],
  },
  {
    name: 'typescript source',
    files: ['src/**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked, tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          fixStyle: 'inline-type-imports',
          prefer: 'type-imports',
        },
      ],
    },
  },
  {
    name: 'business module boundaries',
    files: ['src/modules/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '(^|/)integrations/',
              message: 'Business modules must not depend on inbound or outbound integrations.',
            },
            {
              regex: '(^|/)platform/http/',
              message: 'Business modules must not depend on HTTP transport code.',
            },
          ],
        },
      ],
    },
  },
  {
    name: 'integration to module boundaries',
    files: ['src/integrations/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '(^|/)modules/[^/]+/(?!public\\.js$)',
              message: 'Integrations must import business modules through their public.ts API.',
            },
          ],
        },
      ],
    },
  }
);

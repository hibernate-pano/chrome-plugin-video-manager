import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: [
      'src/content/**/*.test.ts',
      'src/shared/**/*.test.ts',
      'src/options/**/*.test.ts',
      'src/background/**/*.test.ts',
      'scripts/**/*.test.ts',
    ],
    exclude: ['dist/**', 'tests/**', '.worktrees/**', 'node_modules/**'],
    restoreMocks: true,
    clearMocks: true,
  },
});

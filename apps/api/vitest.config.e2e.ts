import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./test/test-env.ts'],
    // These tests share one database, so they can't run at the same time.
    fileParallelism: false,
    // Argon2 is slow on purpose.
    testTimeout: 20_000,
  },
});

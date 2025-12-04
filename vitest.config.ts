import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['__tests__/**/*.test.ts', '__tests__/**/*.prop.ts'],
    testTimeout: 60000,
    coverage: {
      provider: 'v8'
    }
  }
});

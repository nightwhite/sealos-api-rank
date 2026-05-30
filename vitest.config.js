import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    clearMocks: true,
    include: ['tests/**/*.test.js'],
    exclude: ['reference/**', 'node_modules/**'],
  },
});

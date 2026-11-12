import { defineConfig } from 'vitest/config';
import angular from '@analogjs/vite-plugin-angular';

export default defineConfig({
  plugins: [angular()],
  test: {
    server: { deps: { inline: [/@angular\//] } },
    passWithNoTests: true,
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      exclude: [
        'src/test-setup.ts',
        'src/main.ts',
        'src/environments/**',
        '**/*.mock.ts',
      ],
    },
  },
});

import { defineConfig } from 'vitest/config';
import packageJson from './package.json' with { type: 'json' };

// Served from https://klenwell.github.io/spoofball/, so every asset path
// needs the /spoofball/ prefix.
export default defineConfig({
  base: '/spoofball/',
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});

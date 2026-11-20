import { defineConfig } from 'vitest/config';
import packageJson from './package.json' with { type: 'json' };

// Served from https://klenwell.com/spoofball/ (GitHub Pages), so every asset path
// needs the /spoofball/ prefix.
export default defineConfig({
  base: '/spoofball/',
  build: {
    rolldownOptions: {
      // Two pages: the game, and the style guide at /spoofball/style/.
      input: {
        main: 'index.html',
        style: 'style/index.html',
      },
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});

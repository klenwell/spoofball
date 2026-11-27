import { installDesignTokens } from './design/install';
import { mountAppShell } from './ui/app-shell';
import './ui/app.css';

installDesignTokens();

const root = document.querySelector<HTMLElement>('#app');
if (!root) {
  throw new Error('Missing #app element in index.html');
}

mountAppShell(root);

// The QA console (#117): dev only. Vite replaces `import.meta.env.DEV` with
// false in a production build and drops this, and scripts/check-dev-free.js
// fails the build if any of it gets through.
if (import.meta.env.DEV) void import('./dev/qa');

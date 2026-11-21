import { installDesignTokens } from './design/install';
import { mountAppShell } from './ui/app-shell';
import './ui/app.css';

installDesignTokens();

const root = document.querySelector<HTMLElement>('#app');
if (!root) {
  throw new Error('Missing #app element in index.html');
}

mountAppShell(root);

import { appInfo } from './app-info';
import './style.css';

const versionElement = document.querySelector<HTMLElement>('#version');
if (!versionElement) {
  throw new Error('Missing #version element in index.html');
}

// textContent, not innerHTML, so the value is never parsed as HTML.
versionElement.textContent = appInfo().version;

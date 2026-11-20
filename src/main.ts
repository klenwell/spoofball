import { appInfo } from './app-info';
import './style.css';

const app = document.querySelector<HTMLElement>('#app');
if (!app) {
  throw new Error('Missing #app element in index.html');
}

const { name, version } = appInfo();

// Build with DOM methods rather than innerHTML, so no text is ever parsed as HTML.
const title = document.createElement('h1');
title.textContent = name;

const versionLine = document.createElement('p');
versionLine.className = 'version';
versionLine.textContent = version;

app.replaceChildren(title, versionLine);

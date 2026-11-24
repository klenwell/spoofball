// Measures how smoothly the combine's warm-ups run in Chrome on a phone-class
// CPU (#72): all 10 candidates moving at once. Starts Vite's dev server and
// headless Chrome, opens the combine with a saved draft, slows Chrome's CPU 4×
// over the DevTools protocol, then times the page's frames for a few seconds,
// and stops both by the PIDs it started.
//
// Usage: node scripts/combine-perf.js
//   CHROME=/path/to/chrome  if Chrome isn't `google-chrome` on the PATH
//   SECONDS=5               how long to time frames (default 5)
//   SLOWDOWN=1              CPU slowdown factor (default 4, phone class)
//
// Smooth means at least 95% of frames are drawn within 2 of the screen's
// 60 Hz frames (34 ms), and the work in a frame (stepping and drawing all 10
// warm-ups) stays well inside one frame: under 8 ms at the 95th percentile.

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const VITE_PORT = 5196;
const DEBUG_PORT = 9336;
const SLOWDOWN = Number(process.env.SLOWDOWN ?? 4);
const SECONDS = Number(process.env.SECONDS ?? 5);
const SMOOTH_FRAME_MS = 34;
const SMOOTH_SHARE = 0.95;
const WORK_LIMIT_MS = 8;
const chrome = process.env.CHROME ?? 'google-chrome';
const base = `http://127.0.0.1:${String(VITE_PORT)}/spoofball/`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(url, tries = 50) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
    } catch {
      // not up yet
    }
    await sleep(200);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

const profile = mkdtempSync(join(tmpdir(), 'combine-perf-'));
const vite = spawn('node_modules/.bin/vite', ['--port', String(VITE_PORT), '--strictPort'], {
  stdio: 'ignore',
});
const browser = spawn(
  chrome,
  [
    '--headless=new',
    '--disable-gpu',
    `--remote-debugging-port=${String(DEBUG_PORT)}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
);

try {
  await waitFor(base);
  const targets = await (await waitFor(`http://127.0.0.1:${String(DEBUG_PORT)}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve) => ws.addEventListener('open', resolve));
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      id += 1;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const reply = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (reply.result.exceptionDetails)
      throw new Error(JSON.stringify(reply.result.exceptionDetails));
    return reply.result.result.value;
  };

  await send('Page.enable');
  // A phone-sized screen, where the cells are smallest and most crowded.
  await send('Emulation.setDeviceMetricsOverride', {
    width: 360,
    height: 780,
    deviceScaleFactor: 2,
    mobile: true,
  });
  // Time the combine's own frame work: its animation callback is named \`frame\`
  // (combine-screen.ts), and the dev server doesn't minify names.
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.__work = []; const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (fn) => fn.name !== 'frame' ? raf(fn) : raf((t) => { const t0 = performance.now(); fn(t); window.__work.push(performance.now() - t0); });`,
  });
  await send('Page.navigate', { url: base });
  await sleep(1200);
  await evaluate(`(async () => {
    const { saveDraft, browserStorage } = await import('/spoofball/src/storage/saved-team.ts');
    const { startDraft } = await import('/spoofball/src/game/draft.ts');
    saveDraft(browserStorage(), startDraft({ name: 'Perf', color: 'teal', logo: '🦉' }, 12345));
    location.hash = '#/combine';
    location.reload();
  })()`);
  await sleep(2000);
  const cells = await evaluate(`document.querySelectorAll('.combine-canvas').length`);
  await send('Emulation.setCPUThrottlingRate', { rate: SLOWDOWN });
  await sleep(500);
  const result = await evaluate(`new Promise((resolve) => {
    window.__work = [];
    const gaps = [];
    let last = performance.now();
    const end = last + ${String(SECONDS * 1000)};
    const tick = (now) => {
      gaps.push(now - last);
      last = now;
      if (now < end) requestAnimationFrame(tick);
      else resolve({ gaps, work: window.__work });
    };
    requestAnimationFrame(tick);
  })`);
  const sorted = (xs) => [...xs].sort((a, b) => a - b);
  const at = (xs, p) => xs[Math.min(xs.length - 1, Math.floor(p * xs.length))];
  const gaps = sorted(result.gaps);
  const work = sorted(result.work);
  const smooth = gaps.filter((g) => g <= SMOOTH_FRAME_MS).length / gaps.length;
  const workP95 = at(work, 0.95);
  const pass = cells === 10 && work.length > 0 && smooth >= SMOOTH_SHARE && workP95 < WORK_LIMIT_MS;
  console.log(
    `${pass ? 'PASS' : 'FAIL'}: ${String(cells)} warm-ups, CPU slowed ${String(SLOWDOWN)}×, ${String(gaps.length)} frames in ${String(SECONDS)} s: ` +
      `frame gap median ${at(gaps, 0.5).toFixed(1)} ms, 95th ${at(gaps, 0.95).toFixed(1)} ms, ` +
      `${(smooth * 100).toFixed(1)}% within ${String(SMOOTH_FRAME_MS)} ms; ` +
      `warm-up work a frame (${String(work.length)} frames): median ${at(work, 0.5).toFixed(2)} ms, 95th ${workP95.toFixed(2)} ms, slowest ${at(work, 1).toFixed(2)} ms (limit ${String(WORK_LIMIT_MS)} ms)`,
  );
  ws.close();
  process.exitCode = pass ? 0 : 1;
} finally {
  browser.kill();
  vite.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}

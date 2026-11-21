// Measures how long a scrum takes to simulate in Chrome on a phone-class CPU
// (#36). Starts Vite's dev server and headless Chrome, slows Chrome's CPU 4×
// over the DevTools protocol (Emulation.setCPUThrottlingRate), times scrums
// with the preset lineup in the page, then stops both by the PIDs it started.
//
// Usage: node scripts/scrum-perf.js
//   CHROME=/path/to/chrome  if Chrome isn't `google-chrome` on the PATH
//   RUNS=40                 how many scrums to time (default 30)
//   SLOWDOWN=1              CPU slowdown factor (default 4, phone class)
//
// The plan's limit (#33): under 1000 ms a scrum at 4× slowdown.

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const VITE_PORT = 5199;
const DEBUG_PORT = 9339;
const SLOWDOWN = Number(process.env.SLOWDOWN ?? 4);
const RUNS = Number(process.env.RUNS ?? 30);
const LIMIT_MS = 1000;
const chrome = process.env.CHROME ?? 'google-chrome';

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

const profile = mkdtempSync(join(tmpdir(), 'scrum-perf-'));
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
  await waitFor(`http://127.0.0.1:${String(VITE_PORT)}/spoofball/`);
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

  await send('Page.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${String(VITE_PORT)}/spoofball/` });
  await sleep(1500);
  await send('Emulation.setCPUThrottlingRate', { rate: SLOWDOWN });

  const expression = `(async () => {
    const { simulateScrum } = await import('/spoofball/src/game/scrum.ts');
    const { createRandom } = await import('/spoofball/src/game/random.ts');
    const { presetScrumEntries } = await import('/spoofball/src/test-support/scrum.ts');
    const entries = presetScrumEntries();
    for (let i = 0; i < 5; i += 1) simulateScrum(entries, { random: createRandom(i) });
    const times = [];
    for (let i = 0; i < ${String(RUNS)}; i += 1) {
      const t0 = performance.now();
      simulateScrum(entries, { random: createRandom(1000 + i) });
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    return { spoofs: entries.length, median: times[Math.floor(times.length / 2)], max: times[times.length - 1] };
  })()`;
  const reply = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (reply.result.exceptionDetails) throw new Error(JSON.stringify(reply.result.exceptionDetails));
  const { spoofs, median, max } = reply.result.result.value;
  const verdict = max < LIMIT_MS ? 'PASS' : 'FAIL';
  console.log(
    `${verdict}: ${String(RUNS)} scrums, ${String(spoofs)} spoofs, CPU slowed ${String(SLOWDOWN)}×: ` +
      `median ${median.toFixed(1)} ms, slowest ${max.toFixed(1)} ms (limit ${String(LIMIT_MS)} ms)`,
  );
  ws.close();
  process.exitCode = verdict === 'PASS' ? 0 : 1;
} finally {
  browser.kill();
  vite.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}

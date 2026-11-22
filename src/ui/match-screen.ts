import { matchKits, type Kit } from '../design/kits';
import { arenaBounds, benchSeats } from '../game/arena';
import { PRESET_HOME, PRESET_VISITOR } from '../game/preset-teams';
import { createRandom } from '../game/random';
import { finalScores, liveScores, type Scores } from '../game/scoring';
import { simulateScrum, type ScrumFrame } from '../game/scrum';
import { avatarOf, type SpoofType } from '../game/spoof-types';
import { SCRUM_SECONDS } from '../game/spoof-motion';
import { lineupEntries, type Lineup } from '../game/teams';
import type { Panel } from './app-shell';
import { drawArena, drawSpoofInArena } from './arena';
import { arenaHeightFor, fitArena, type ArenaView } from './arena-view';
import { createCanvas } from './canvas';
import { advance, frameAt, isOver, scoresAt, startFrame } from './playback';
import { drawImpactRing, impactsAt, type Impact } from './impacts';
import { drawSpoofDisc } from './spoof-disc';

/**
 * The Match screen (#38): press Start scrum and watch the two preset teams
 * play an 8-second scrum, with a live scoreboard and clock, then the result.
 * The scrum is simulated up front, then played back at the screen's frame
 * rate (the plan's default 1, #33). Tap the arena or Pause to pause, and
 * leaving the tab or the page pauses too.
 *
 * How opponents collide and how lively spoofs are use the game's defaults,
 * which the owner picked on review-only sliders during #49.
 */

const MAX_ARENA_WIDTH = 480;
/** The longest a single display frame may advance playback, so a hiccup doesn't skip ahead. */
const MAX_STEP_SECONDS = 0.1;

type Status = 'ready' | 'playing' | 'paused' | 'done';

const LINEUPS: readonly Lineup[] = [PRESET_HOME, PRESET_VISITOR];
const ENTRIES = LINEUPS.flatMap(lineupEntries);

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function newSeed(): number {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] ?? 1;
}

function avatarName(type: SpoofType): string {
  const name = avatarOf(type);
  return name.charAt(0).toUpperCase() + name.slice(1);
}

interface Played {
  readonly seed: number;
  readonly frames: readonly ScrumFrame[];
  readonly live: readonly Scores[];
  readonly final: Scores;
}

function play(seed: number): Played {
  const result = simulateScrum(ENTRIES, { random: createRandom(seed) });
  const last = result.frames[result.frames.length - 1];
  if (!last) throw new Error('A scrum produced no frames');
  return {
    seed,
    frames: [startFrame(ENTRIES), ...result.frames],
    live: liveScores(result.frames),
    final: finalScores(last),
  };
}

export function createMatchScreen(): Panel {
  const kits = matchKits(PRESET_HOME.team.color, PRESET_VISITOR.team.color);
  const kitFor = (side: string): Kit => (side === 'home' ? kits.home : kits.visitor);
  const typeOf = new Map(LINEUPS.flatMap((l) => l.team.spoofs.map((s) => [s.id, s.type] as const)));

  let status: Status = 'ready';
  let seconds = 0;
  let lastTick = 0;
  let scrum: Played | null = null;
  let raf = 0;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // --- Scoreboard ---------------------------------------------------------
  const board = el('div', 'scoreboard');
  const side = (lineup: Lineup) => {
    const block = el('div', `scoreboard-team scoreboard-${lineup.side}`);
    const swatch = el('span', 'match-swatch');
    swatch.style.background = kitFor(lineup.side).fill;
    swatch.style.borderColor = kitFor(lineup.side).trim;
    swatch.setAttribute('aria-hidden', 'true');
    const score = el('span', 'scoreboard-score', '0');
    block.append(swatch, el('span', 'scoreboard-name', lineup.team.name), score);
    return { block, score };
  };
  const home = side(PRESET_HOME);
  const visitor = side(PRESET_VISITOR);
  const middle = el('div', 'scoreboard-middle');
  const clockText = el('span', 'scoreboard-clock', '8.0 s');
  const clockBar = el('div', 'clock-bar');
  const clockFill = el('div', 'clock-fill');
  clockBar.append(clockFill);
  clockBar.setAttribute('aria-hidden', 'true');
  middle.append(el('span', 'scoreboard-label', 'Scrum'), clockText);
  board.append(home.block, middle, visitor.block);

  // --- Arena ----------------------------------------------------------------
  const stage = el('div', 'match-stage');
  stage.setAttribute('role', 'img');
  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let view: ArenaView | null = null;
  const bounds = arenaBounds();

  // --- Controls -----------------------------------------------------------
  const controls = el('div', 'match-controls');
  const startButton = el('button', 'button button-primary', 'Start scrum');
  startButton.type = 'button';
  const pauseButton = el('button', 'button', 'Pause');
  pauseButton.type = 'button';
  pauseButton.hidden = true;
  controls.append(startButton, pauseButton);

  const results = el('section', 'match-results');
  results.hidden = true;
  results.setAttribute('aria-live', 'polite');

  const root = el('div', 'match-screen');
  root.append(board, clockBar, stage, controls, results);

  // --- Drawing -------------------------------------------------------------
  function current(): ScrumFrame {
    return scrum ? frameAt(scrum.frames, seconds) : startFrame(ENTRIES);
  }

  function draw(): void {
    if (!ctx || !view) return;
    const c = ctx;
    const v = view;
    c.clearRect(0, 0, c.canvas.width, c.canvas.height);
    drawArena(c, v);
    // Benched spoofs wait in their seats.
    for (const lineup of LINEUPS) {
      const seats = benchSeats(lineup.side);
      for (const spoof of lineup.team.spoofs) {
        const spot = lineup.spots[spoof.id];
        if (!spot || !('seat' in spot)) continue;
        const seat = seats[spot.seat];
        if (!seat) continue;
        drawSpoofInArena(c, v, {
          x: seat.x,
          y: seat.y,
          radius: spoof.radius,
          type: spoof.type,
          kit: kitFor(lineup.side),
        });
      }
    }
    for (const s of current().spoofs) {
      const type = typeOf.get(s.id);
      if (!type) continue;
      drawSpoofInArena(c, v, {
        x: s.x,
        y: s.y,
        radius: s.radius,
        type,
        kit: kitFor(s.team),
        fatigue: Math.min(100, s.fatigue),
      });
    }
    // Hit cues go on top, so a hit shows even where discs overlap.
    const reduced = reducedMotion.matches;
    for (const impact of showingImpacts()) drawImpactRing(c, v, impact, reduced);
  }

  /** The hit cues showing now. None before a scrum or once it's over, so the final picture is clear. */
  function showingImpacts(): Impact[] {
    if (!scrum || status === 'done' || status === 'ready') return [];
    return impactsAt(scrum.frames, seconds);
  }

  function rebuildCanvas(): void {
    const width = Math.min(stage.clientWidth, MAX_ARENA_WIDTH);
    if (width <= 0) return;
    const height = arenaHeightFor(bounds, width);
    const made = createCanvas(width, height);
    canvas = made.canvas;
    ctx = made.ctx;
    view = fitArena(bounds, width, height);
    canvas.addEventListener('click', togglePause);
    stage.replaceChildren(canvas);
    draw();
  }

  // --- Text and labels -------------------------------------------------------
  let lastLabelSecond = -1;
  function updateText(force = false): void {
    const left = Math.max(0, SCRUM_SECONDS - seconds);
    const scores =
      status === 'done' && scrum ? scrum.final : scrum ? scoresAt(scrum.live, seconds) : null;
    home.score.textContent = String(scores?.teams.home ?? 0);
    visitor.score.textContent = String(scores?.teams.visitor ?? 0);
    clockText.textContent = `${left.toFixed(1)} s`;
    clockFill.style.width = `${String((left / SCRUM_SECONDS) * 100)}%`;
    const whole = Math.floor(seconds);
    if (!force && whole === lastLabelSecond) return;
    lastLabelSecond = whole;
    const score = `${PRESET_HOME.team.name} ${home.score.textContent}, ${PRESET_VISITOR.team.name} ${visitor.score.textContent}`;
    const state = {
      ready: 'Ready to start. Each team has 3 spoofs on the court and 2 on its bench.',
      playing: `Scrum playing, ${left.toFixed(0)} seconds left. ${score}.`,
      paused: `Scrum paused, ${left.toFixed(0)} seconds left. ${score}.`,
      done: `Scrum over. Final score: ${score}.`,
    }[status];
    stage.setAttribute('aria-label', `The court. ${state}`);
  }

  function showResults(): void {
    if (!scrum) return;
    const final = scrum.final;
    results.replaceChildren(el('h2', 'match-results-title', 'Final score'));
    for (const lineup of LINEUPS) {
      const list = el('ul', 'match-results-list');
      const heading = el(
        'h3',
        'match-results-team',
        `${lineup.team.name} ${String(final.teams[lineup.side] ?? 0)}`,
      );
      for (const entry of ENTRIES.filter((e) => e.team === lineup.side)) {
        const item = el('li', 'match-results-row');
        const { canvas: disc, ctx: discCtx } = createCanvas(28, 28);
        disc.setAttribute('aria-hidden', 'true');
        drawSpoofDisc(discCtx, {
          x: 14,
          y: 14,
          radius: 11,
          type: entry.spoof.type,
          kit: kitFor(lineup.side),
        });
        const points = final.spoofs[entry.spoof.id] ?? 0;
        item.append(
          disc,
          el('span', 'match-results-name', avatarName(entry.spoof.type)),
          el('span', 'match-results-points', `${String(points)} ${points === 1 ? 'pt' : 'pts'}`),
        );
        list.append(item);
      }
      results.append(heading, list);
    }
    results.hidden = false;
  }

  function updateControls(): void {
    startButton.hidden = status === 'playing' || status === 'paused';
    startButton.textContent = status === 'done' ? 'Start another scrum' : 'Start scrum';
    pauseButton.hidden = !(status === 'playing' || status === 'paused');
    pauseButton.textContent = status === 'paused' ? 'Resume' : 'Pause';
    pauseButton.setAttribute('aria-pressed', String(status === 'paused'));
  }

  // --- Playback loop ---------------------------------------------------------
  function tick(now: number): void {
    if (status !== 'playing') return;
    const elapsed = Math.min(MAX_STEP_SECONDS, (now - lastTick) / 1000);
    lastTick = now;
    seconds = advance(seconds, elapsed);
    if (isOver(seconds)) {
      const hadFocus = document.activeElement === pauseButton;
      status = 'done';
      draw();
      updateText(true);
      updateControls();
      showResults();
      // Pause hides at the end; keep a keyboard user on the controls.
      if (hadFocus) startButton.focus();
      return;
    }
    draw();
    updateText();
    raf = requestAnimationFrame(tick);
  }

  function run(): void {
    const hadFocus = document.activeElement === startButton;
    status = 'playing';
    lastTick = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
    updateControls();
    updateText(true);
    // Start hides while it has focus; keep a keyboard user on the controls.
    if (hadFocus) pauseButton.focus();
  }

  function start(seed: number): void {
    scrum = play(seed);
    seconds = 0;
    results.hidden = true;
    run();
  }

  function pause(): void {
    if (status !== 'playing') return;
    status = 'paused';
    cancelAnimationFrame(raf);
    updateControls();
    updateText(true);
  }

  function togglePause(): void {
    if (status === 'playing') pause();
    else if (status === 'paused') run();
  }

  // --- Events -----------------------------------------------------------------
  startButton.addEventListener('click', () => {
    start(newSeed());
  });
  pauseButton.addEventListener('click', togglePause);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
  });

  let lastWidth = -1;
  new ResizeObserver(() => {
    if (stage.clientWidth === lastWidth) return;
    lastWidth = stage.clientWidth;
    rebuildCanvas();
  }).observe(stage);

  updateControls();
  updateText(true);

  return { element: root, hide: pause };
}

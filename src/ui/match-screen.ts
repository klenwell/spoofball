import { matchKits, type Kit } from '../design/kits';
import { arenaBounds, benchSeats, type BenchSide } from '../game/arena';
import {
  REFUSAL_TEXT,
  computerMove,
  drawOrder,
  isMiseOver,
  leftToPlace,
  miseEntries,
  placeSpoof,
  startMise,
  whoseTurn,
  MISE_TURNS,
} from '../game/mise';
import { PRESET_HOME, PRESET_VISITOR } from '../game/preset-teams';
import { createRandom, type Random } from '../game/random';
import { finalScores, liveScores, type Scores } from '../game/scoring';
import { simulateScrum, type ScrumEntry, type ScrumFrame } from '../game/scrum';
import { avatarOf, type SpoofType } from '../game/spoof-types';
import { SCRUM_SECONDS } from '../game/spoof-motion';
import type { Lineup, Spoof } from '../game/teams';
import type { Panel } from './app-shell';
import { drawArena, drawSpoofInArena } from './arena';
import { arenaHeightFor, courtPointAt, fitArena, type ArenaView } from './arena-view';
import { createCanvas } from './canvas';
import { drawImpactRing, impactsAt, type Impact } from './impacts';
import { drawGraceRing, drawInsideLine, drawPlacingHalo, drawRefusedRing } from './mise-draw';
import {
  aim,
  cancel,
  drag,
  graceProgress,
  heldPoint,
  press,
  release,
  startHand,
  tick as tickHand,
  type Hand,
} from './mise-hand';
import { advance, frameAt, isOver, scoresAt, startFrame } from './playback';
import { drawSpoofDisc } from './spoof-disc';

/**
 * The Match screen. First the mise (#39): the two teams take turns placing 3
 * spoofs each, you by tapping a spoof on your bench and then a spot on the
 * court, the Embers by themselves after a short pause. Then press Start scrum
 * and watch the 8-second scrum (#38), with a live scoreboard and clock, then
 * the result. The scrum is simulated up front, then played back at the
 * screen's frame rate. Tap the arena or Pause to pause, and leaving the tab
 * or the page pauses too.
 *
 * A match's random choices (the host, the turn order, the Embers' moves, the
 * scrum) all come from one seed, so with your taps it can be replayed.
 */

const MAX_ARENA_WIDTH = 480;
/** The longest a single display frame may advance playback, so a hiccup doesn't skip ahead. */
const MAX_STEP_SECONDS = 0.1;
/** How long the Embers wait before placing a spoof, so you can follow them. */
const COMPUTER_PAUSE_MS = 900;
/**
 * How far above a finger a dragged spoof is held, in court units, so the
 * finger doesn't hide where it will land. A mouse drags it right under the pointer.
 */
const TOUCH_LIFT = 30;
/** A spoof being dragged to a spot that isn't allowed is drawn this faint. */
const REFUSED_OPACITY = 0.45;

/** Seconds on the page's clock, for the grace period. */
const nowSeconds = () => performance.now() / 1000;

type Status = 'mise' | 'ready' | 'playing' | 'paused' | 'done';

const YOU: BenchSide = 'home';
const COMPUTER: BenchSide = 'visitor';
const LINEUPS: Readonly<Record<BenchSide, Lineup>> = { home: PRESET_HOME, visitor: PRESET_VISITOR };
const TEAMS: Readonly<Record<BenchSide, readonly Spoof[]>> = {
  home: PRESET_HOME.team.spoofs,
  visitor: PRESET_VISITOR.team.spoofs,
};
const SIDES: readonly BenchSide[] = ['home', 'visitor'];

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
  readonly frames: readonly ScrumFrame[];
  readonly live: readonly Scores[];
  readonly final: Scores;
  readonly entries: readonly ScrumEntry[];
}

function play(entries: readonly ScrumEntry[], seed: number): Played {
  const result = simulateScrum(entries, { random: createRandom(seed) });
  const last = result.frames[result.frames.length - 1];
  if (!last) throw new Error('A scrum produced no frames');
  return {
    frames: [startFrame(entries), ...result.frames],
    live: liveScores(result.frames),
    final: finalScores(last),
    entries,
  };
}

export function createMatchScreen(): Panel {
  const kits = matchKits(PRESET_HOME.team.color, PRESET_VISITOR.team.color);
  const kitFor = (side: string): Kit => (side === 'home' ? kits.home : kits.visitor);
  const typeOf = new Map(SIDES.flatMap((side) => TEAMS[side].map((s) => [s.id, s.type] as const)));
  const nameOf = (side: BenchSide) => LINEUPS[side].team.name;

  let status: Status = 'mise';
  let seconds = 0;
  let lastTick = 0;
  let raf = 0;
  let random: Random = createRandom(1);
  /** The mise, and your spoof in hand: picked, dragged, or placed and still movable. */
  let hand: Hand = startHand(startMise(drawOrder('visitor', random)));
  let miseRaf = 0;
  /** The Embers' latest placement, outlined so you can see where it went. */
  let justPlaced: string | null = null;
  let computerTimer = 0;
  let scrum: Played | null = null;

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
  const middleLabel = el('span', 'scoreboard-label', 'Mise');
  const clockText = el('span', 'scoreboard-clock', '');
  const clockBar = el('div', 'clock-bar');
  const clockFill = el('div', 'clock-fill');
  clockBar.append(clockFill);
  clockBar.setAttribute('aria-hidden', 'true');
  middle.append(middleLabel, clockText);
  board.append(home.block, middle, visitor.block);

  // --- Mise turns: a dot per turn, in each team's kit ------------------------
  const turnStrip = el('ol', 'mise-turns');
  turnStrip.setAttribute('aria-hidden', 'true');
  const statusLine = el('p', 'match-status');
  statusLine.setAttribute('aria-live', 'polite');

  // --- Arena ----------------------------------------------------------------
  const stage = el('div', 'match-stage');
  stage.setAttribute('role', 'img');
  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let view: ArenaView | null = null;
  const bounds = arenaBounds();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // --- Controls -----------------------------------------------------------
  const controls = el('div', 'match-controls');
  const startButton = el('button', 'button button-primary', 'Start scrum');
  startButton.type = 'button';
  const pauseButton = el('button', 'button', 'Pause');
  pauseButton.type = 'button';
  controls.append(startButton, pauseButton);

  const results = el('section', 'match-results');
  results.hidden = true;
  results.setAttribute('aria-live', 'polite');

  const root = el('div', 'match-screen');
  root.append(board, clockBar, turnStrip, stage, statusLine, controls, results);

  // --- Drawing -------------------------------------------------------------
  /** Where each spoof is: on the court if placed (or playing), otherwise in its seat. */
  function onCourt(): ScrumFrame['spoofs'] {
    if (scrum) return frameAt(scrum.frames, seconds).spoofs;
    return hand.mise.placements.map((p) => ({
      id: p.spoofId,
      team: p.team,
      x: p.x,
      y: p.y,
      radius: p.radius,
      fatigue: 0,
    }));
  }

  function draw(): void {
    if (!ctx || !view) return;
    const c = ctx;
    const v = view;
    c.clearRect(0, 0, c.canvas.width, c.canvas.height);
    drawArena(c, v);
    const spoofs = onCourt();
    const playing = new Set(spoofs.map((s) => `${s.team}|${s.id}`));
    // Your spoof in hand, or placed but not locked in, has left its seat too.
    const held = hand.held;
    if (held.kind === 'dragging') playing.add(`${YOU}|${held.spoof.id}`);
    if (hand.pending) playing.add(`${YOU}|${hand.pending.spoof.id}`);
    // Spoofs not on the court wait in their seats: spoof k in seat k.
    for (const team of SIDES) {
      const seats = benchSeats(team);
      TEAMS[team].forEach((spoof, k) => {
        const seat = seats[k];
        if (!seat || playing.has(`${team}|${spoof.id}`)) return;
        drawSpoofInArena(c, v, {
          x: seat.x,
          y: seat.y,
          radius: spoof.radius,
          type: spoof.type,
          kit: kitFor(team),
          highlighted: team === YOU && held.kind === 'picked' && held.spoof.id === spoof.id,
        });
      });
    }
    for (const s of spoofs) {
      const type = typeOf.get(s.id);
      if (!type) continue;
      drawSpoofInArena(c, v, {
        x: s.x,
        y: s.y,
        radius: s.radius,
        type,
        kit: kitFor(s.team),
        fatigue: Math.min(100, s.fatigue),
        highlighted: status === 'mise' && s.team === COMPUTER && s.id === justPlaced,
      });
    }
    if (status === 'mise') drawHand(c, v);
    // Hit cues go on top, so a hit shows even where discs overlap.
    const reduced = reducedMotion.matches;
    for (const impact of showingImpacts()) drawImpactRing(c, v, impact, reduced);
  }

  /** Your spoof placed but not locked in, with its grace ring, and the one you're dragging. */
  function drawHand(c: CanvasRenderingContext2D, v: ArenaView): void {
    const pending = hand.pending;
    const held = hand.held;
    const draggingPending = held.kind === 'dragging' && held.from === 'pending';
    if (pending && !draggingPending) {
      drawSpoofInArena(c, v, {
        ...pending.spot,
        radius: pending.spoof.radius,
        type: pending.spoof.type,
        kit: kitFor(YOU),
      });
      drawGraceRing(c, v, pending.spot, pending.spoof.radius, graceProgress(hand, nowSeconds()));
    }
    if (held.kind !== 'dragging') return;
    const landing = aim(hand, YOU);
    const disc = { radius: held.spoof.radius, type: held.spoof.type, kit: kitFor(YOU) };
    if (landing?.kind === 'spot') {
      if (landing.inside) drawInsideLine(c, v, hand.mise.court);
      drawPlacingHalo(c, v, landing.spot, held.spoof.radius);
      drawSpoofInArena(c, v, { ...landing.spot, ...disc });
    } else if (landing?.kind === 'refused') {
      c.save();
      c.globalAlpha = REFUSED_OPACITY;
      drawSpoofInArena(c, v, { ...landing.at, ...disc });
      c.restore();
      drawRefusedRing(c, v, landing.at, held.spoof.radius);
    } else {
      drawSpoofInArena(c, v, { ...heldPoint(held), ...disc });
    }
  }

  /** The hit cues showing now: only while a scrum plays or is paused. */
  function showingImpacts(): Impact[] {
    if (!scrum || (status !== 'playing' && status !== 'paused')) return [];
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
    canvas.addEventListener('click', onArenaClick);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerCancel);
    stage.replaceChildren(canvas);
    draw();
  }

  // --- Text and labels -------------------------------------------------------
  function drawTurns(): void {
    turnStrip.hidden = status !== 'mise' && status !== 'ready';
    turnStrip.replaceChildren(
      ...hand.mise.order.map((team, turn) => {
        const dot = el('li', 'mise-turn');
        const kit = kitFor(team);
        dot.style.borderColor = kit.trim;
        if (turn < hand.mise.placements.length) dot.style.background = kit.fill;
        if (turn === hand.mise.placements.length) dot.classList.add('mise-turn-now');
        return dot;
      }),
    );
  }

  /** The instruction or state shown under the arena, also read out to screen readers. */
  function miseMessage(): string {
    const turn = whoseTurn(hand.mise);
    if (!turn) return `All ${String(MISE_TURNS)} spoofs are placed. Press Start scrum.`;
    if (turn === COMPUTER) return `The ${nameOf(COMPUTER)} are placing a spoof…`;
    const held = hand.held;
    const landing = aim(hand, YOU);
    if (landing?.kind === 'bench') return 'Let go to put it back on your bench.';
    if (landing?.kind === 'refused') return REFUSAL_TEXT[landing.refusal];
    if (landing?.kind === 'spot') {
      return landing.inside ? 'Your one spot inside the red line.' : 'Let go to place it here.';
    }
    if (hand.refusal) return REFUSAL_TEXT[hand.refusal];
    if (hand.pending) {
      return 'Placed. Drag it to move it, or back to your bench, before the ring fills.';
    }
    if (held.kind === 'picked') {
      return `Tap the court to place your ${avatarName(held.spoof.type).toLowerCase()}, or drag it there.`;
    }
    return 'Your turn: drag a spoof from your bench onto the court, or tap it, then tap a spot.';
  }

  let lastLabelSecond = -1;
  function updateText(force = false): void {
    if (status === 'mise' || status === 'ready') {
      middleLabel.textContent = 'Mise';
      const turn = Math.min(hand.mise.placements.length + 1, MISE_TURNS);
      clockText.textContent = `Turn ${String(turn)} of ${String(MISE_TURNS)}`;
      home.score.textContent = `${String(leftToPlace(hand.mise, 'home'))} to place`;
      visitor.score.textContent = `${String(leftToPlace(hand.mise, 'visitor'))} to place`;
      clockBar.hidden = true;
      drawTurns();
      const state =
        status === 'ready'
          ? 'The mise is over.'
          : `Turn ${String(turn)} of ${String(MISE_TURNS)}: the ${nameOf(whoseTurn(hand.mise) ?? YOU)} place a spoof.`;
      stage.setAttribute(
        'aria-label',
        `The court. ${state} ${nameOf('home')} have ${String(leftToPlace(hand.mise, 'home'))} to place, ${nameOf('visitor')} ${String(leftToPlace(hand.mise, 'visitor'))}.`,
      );
      return;
    }
    middleLabel.textContent = 'Scrum';
    clockBar.hidden = false;
    drawTurns();
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
    const score = `${nameOf('home')} ${home.score.textContent}, ${nameOf('visitor')} ${visitor.score.textContent}`;
    const state = {
      playing: `Scrum playing, ${left.toFixed(0)} seconds left. ${score}.`,
      paused: `Scrum paused, ${left.toFixed(0)} seconds left. ${score}.`,
      done: `Scrum over. Final score: ${score}.`,
    }[status];
    stage.setAttribute('aria-label', `The court. ${state}`);
  }

  /** Shows a message under the arena; only when it changes, so a screen reader isn't flooded mid-drag. */
  function say(message: string): void {
    if (statusLine.textContent !== message) statusLine.textContent = message;
  }

  function showResults(): void {
    if (!scrum) return;
    const final = scrum.final;
    results.replaceChildren(el('h2', 'match-results-title', 'Final score'));
    for (const team of SIDES) {
      const list = el('ul', 'match-results-list');
      const heading = el(
        'h3',
        'match-results-team',
        `${nameOf(team)} ${String(final.teams[team] ?? 0)}`,
      );
      for (const entry of scrum.entries.filter((e) => e.team === team)) {
        const item = el('li', 'match-results-row');
        const { canvas: disc, ctx: discCtx } = createCanvas(28, 28);
        disc.setAttribute('aria-hidden', 'true');
        drawSpoofDisc(discCtx, {
          x: 14,
          y: 14,
          radius: 11,
          type: entry.spoof.type,
          kit: kitFor(team),
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
    startButton.hidden = !(status === 'ready' || status === 'done');
    startButton.textContent = status === 'done' ? 'New match' : 'Start scrum';
    pauseButton.hidden = !(status === 'playing' || status === 'paused');
    pauseButton.textContent = status === 'paused' ? 'Resume' : 'Pause';
    pauseButton.setAttribute('aria-pressed', String(status === 'paused'));
    // On the stage, which outlives the canvas: the canvas is rebuilt when the
    // page resizes. While you place, a drag on the arena moves a spoof rather
    // than scrolling the page (app.css).
    stage.classList.toggle('is-placing', status === 'mise');
    stage.classList.toggle('is-your-turn', status === 'mise' && whoseTurn(hand.mise) === YOU);
  }

  function refresh(): void {
    draw();
    updateText(true);
    updateControls();
  }

  // --- The mise ----------------------------------------------------------------
  function newMatch(): void {
    window.clearTimeout(computerTimer);
    cancelAnimationFrame(raf);
    cancelAnimationFrame(miseRaf);
    random = createRandom(newSeed());
    // The host places last; picked at random each match (docs/design.md).
    const host = random.pick(SIDES);
    hand = startHand(startMise(drawOrder(host, random)));
    justPlaced = null;
    scrum = null;
    seconds = 0;
    status = 'mise';
    results.hidden = true;
    say(miseMessage());
    refresh();
    nextTurn();
  }

  /** Moves the mise on: the Embers play after a pause; on your turn it waits for a tap. */
  function nextTurn(): void {
    if (isMiseOver(hand.mise)) {
      const hadFocus = document.activeElement === pauseButton;
      status = 'ready';
      say(miseMessage());
      refresh();
      if (hadFocus) startButton.focus();
      return;
    }
    if (whoseTurn(hand.mise) !== COMPUTER) return;
    computerTimer = window.setTimeout(() => {
      const move = computerMove(hand.mise, COMPUTER, TEAMS[COMPUTER], random);
      hand = { ...hand, mise: placeSpoof(hand.mise, move.spoof, COMPUTER, move.spot) };
      justPlaced = move.spoof.id;
      say(miseMessage());
      refresh();
      nextTurn();
    }, COMPUTER_PAUSE_MS);
  }

  /** Shows the hand's state: redraws, and says what to do. */
  function showHand(): void {
    draw();
    say(miseMessage());
  }

  /**
   * Runs while a spoof is in hand or placed but not locked in: redraws the
   * grace ring, and locks the spoof in once its grace period is over.
   */
  function miseLoop(): void {
    cancelAnimationFrame(miseRaf);
    const step = () => {
      if (status !== 'mise') return;
      const placed = hand.mise.placements.length;
      hand = tickHand(hand, YOU, nowSeconds());
      if (hand.mise.placements.length > placed) {
        justPlaced = null;
        say(miseMessage());
        refresh();
        nextTurn();
        return;
      }
      draw();
      if (hand.pending || hand.held.kind === 'dragging') miseRaf = requestAnimationFrame(step);
    };
    miseRaf = requestAnimationFrame(step);
  }

  function pointAt(event: PointerEvent) {
    return view ? courtPointAt(view, event.offsetX, event.offsetY) : null;
  }

  function onPointerDown(event: PointerEvent): void {
    if (status !== 'mise' || !canvas) return;
    if (whoseTurn(hand.mise) !== YOU) {
      say(`Wait for the ${nameOf(COMPUTER)} to place their spoof.`);
      return;
    }
    const point = pointAt(event);
    if (!point) return;
    hand = press(hand, YOU, TEAMS[YOU], point, event.pointerType === 'touch' ? TOUCH_LIFT : 0);
    // Keep getting this pointer's moves even if it leaves the canvas.
    canvas.setPointerCapture(event.pointerId);
    showHand();
    miseLoop();
  }

  function onPointerMove(event: PointerEvent): void {
    if (status !== 'mise' || hand.held.kind !== 'dragging') return;
    const point = pointAt(event);
    if (!point) return;
    hand = drag(hand, point);
    showHand();
  }

  function onPointerUp(event: PointerEvent): void {
    if (status !== 'mise' || whoseTurn(hand.mise) !== YOU) return;
    const point = pointAt(event);
    if (!point) return;
    hand = release(hand, YOU, point, nowSeconds());
    showHand();
    miseLoop();
  }

  function onPointerCancel(): void {
    if (status !== 'mise') return;
    hand = cancel(hand);
    showHand();
  }

  /** A click on the arena pauses or resumes a scrum. During the mise, pointer events handle it. */
  function onArenaClick(): void {
    if (status === 'playing' || status === 'paused') togglePause();
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
      say('');
      refresh();
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

  function startScrum(): void {
    // The scrum's seed comes from the match's, after the mise's choices.
    scrum = play(miseEntries(hand.mise, TEAMS), random.int(1, 2 ** 31 - 1));
    seconds = 0;
    results.hidden = true;
    say('');
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
    if (status === 'ready') startScrum();
    else if (status === 'done') newMatch();
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

  newMatch();

  return { element: root, hide: pause };
}

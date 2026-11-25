import { matchKits, type Kit } from '../design/kits';
import { palette } from '../design/tokens';
import { BENCH_HALF_WIDTH, arenaBounds, benchSeats, type BenchSide } from '../game/arena';
import { COURT_RADIUS } from '../game/court';
import {
  SCRUMS_PER_MATCH,
  isMatchOver,
  matchRecord,
  matchScorecard,
  scrumSummary,
  matchScore,
  miseRandom,
  nextMise,
  outcomeFor,
  playScrum,
  scrumEntries,
  scrumNumber,
  startMatch,
  type Match,
  type MatchRecord,
} from '../game/match';
import {
  REFUSAL_TEXT,
  computerMove,
  insideSpotsLeft,
  isMiseOver,
  leftToPlace,
  placeSpoof,
  whoseTurn,
  MISE_TURNS,
} from '../game/mise';
import type { Random } from '../game/random';
import { liveScores, type Scores } from '../game/scoring';
import type { ScrumEntry, ScrumFrame } from '../game/scrum';
import { shownType, type SpoofType } from '../game/spoof-types';
import { SCRUM_SECONDS } from '../game/spoof-motion';
import type { Spoof, Team } from '../game/teams';
import type { Panel } from './app-shell';
import { drawArena, drawSpoofInArena } from './arena';
import { el, newSeed } from './dom';
import { arenaHeightFor, courtPointAt, fitArena, type ArenaView } from './arena-view';
import { createCanvas } from './canvas';
import { drawImpactRing, impactsAt, type Impact } from './impacts';
import {
  drawGraceRing,
  drawInsideLine,
  drawPlacingHalo,
  drawRefusedRing,
  drawScrumCue,
} from './mise-draw';
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
 * spoofs each. You drag a spoof from your bench onto the court, or tap it and
 * then a spot (mise-hand.ts has the rules); the opponent places its own after a
 * short pause. A caption over the opponent's bench says what to do. Once all 6
 * are placed, a "Scrum!" cue, then the 8-second scrum (#38) starts by itself,
 * with a live scoreboard and clock. A match is 3 scrums (#40): after each,
 * a break, then Next scrum starts the next mise, with tired spoofs carrying
 * their fatigue; after the third, the match result. The scrum is simulated
 * up front, then played back at the screen's frame rate. Tap the arena or
 * Pause to pause, and leaving the tab or the page pauses too.
 *
 * A match's random choices (the host, the turn order, the opponent's moves, the
 * scrum) all come from one seed, so with your moves it can be replayed.
 */

const MAX_ARENA_WIDTH = 480;
/** The longest a single display frame may advance playback, so a hiccup doesn't skip ahead. */
const MAX_STEP_SECONDS = 0.1;
/** How long the opponent waits before placing a spoof, so you can follow them. */
const COMPUTER_PAUSE_MS = 900;

/**
 * How long the opponent's latest placement stays outlined, fading out, so you
 * see where it went and then it gets out of the way (the owner, 2026-11-24,
 * on #76). It stayed until your next move before.
 */
const PLACED_OUTLINE_SECONDS = 1.5;
/** How long the "Scrum!" cue shows once all 6 spoofs are placed, before the scrum starts by itself. */
const SCRUM_CUE_MS = 1000;
/**
 * How long the court stays in view when a scrum ends, with the spoofs where
 * they settled, before its result appears: 1.25 s, the owner's pick on #59.
 */
const SETTLE_MS = 1250;
/**
 * How far above a finger a dragged spoof is held, in court units, so the
 * finger doesn't hide where it will land. A mouse drags it right under the pointer.
 */
const TOUCH_LIFT = 30;
/** A spoof being dragged to a spot that isn't allowed is drawn this faint. */
const REFUSED_OPACITY = 0.45;

/** Seconds on the page's clock, for the grace period. */
const nowSeconds = () => performance.now() / 1000;

/** `settling` is the beat after a scrum ends; `break` is between scrums; `done` is the match's end. */
type Status = 'mise' | 'ready' | 'playing' | 'paused' | 'settling' | 'break' | 'done';

const YOU: BenchSide = 'home';
const COMPUTER: BenchSide = 'visitor';
const SIDES: readonly BenchSide[] = ['home', 'visitor'];

/** A team's emoji logo beside its name. Hidden from screen readers, which hear the name. */
function teamLogo(logo: string): HTMLElement {
  const span = el('span', 'team-logo', logo);
  span.setAttribute('aria-hidden', 'true');
  return span;
}

function shownTypeName(type: SpoofType): string {
  const name = shownType(type);
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * A spoof's name, for its row in a scrum's result or on the scorecard (#28).
 * Its mark shows its type to the eye; a screen reader hears the type after the
 * name, since the mark is a picture it skips.
 */
function spoofLabel(spoof: { readonly name: string; readonly type: SpoofType }): HTMLElement {
  const label = el('span', 'spoof-name', spoof.name);
  label.append(el('span', 'visually-hidden', `, ${shownTypeName(spoof.type).toLowerCase()}`));
  return label;
}

/** Hears how each match goes (#89, #90). */
export interface MatchRecorder {
  /**
   * The match so far: as its first scrum starts (with no scrums), then as
   * each scrum's result shows. Leaving before the match ends forfeits it.
   */
  readonly progress: (soFar: MatchRecord) => void;
  /** The finished match, once, as its scorecard shows. */
  readonly end: (record: MatchRecord) => void;
}

/** A scrum being played back: its frames, live scores and final score. */
interface Played {
  readonly frames: readonly ScrumFrame[];
  readonly live: readonly Scores[];
  readonly final: Scores;
  readonly entries: readonly ScrumEntry[];
}

/**
 * The Match screen for your team (home) against an opponent (visitor). Each
 * match's opponent comes from `opponentFor` and the match's seed: a league
 * team drawn at random (#75), or the Embers for the quick start's Spoofs. So
 * **Play another match** may bring a new opponent, and a match still replays
 * from its seed.
 *
 * A `recorder`, given for your saved team only, hears how each match goes,
 * so its stats can record it.
 */
export function createMatchScreen(
  yourTeam: Team,
  opponentFor: (seed: number) => Team,
  recorder?: MatchRecorder,
): Panel {
  /** A new match against the opponent its seed draws. */
  const begin = (seed: number): Match => startMatch(yourTeam, opponentFor(seed), seed);
  // Both teams come from the match in play, so a new match's opponent shows everywhere.
  const teamOf = (side: BenchSide): Team => match.teams[side];
  const TEAMS: Readonly<Record<BenchSide, readonly Spoof[]>> = {
    get home() {
      return match.teams.home.spoofs;
    },
    get visitor() {
      return match.teams.visitor.spoofs;
    },
  };
  let kits = matchKits(yourTeam.color, yourTeam.color);
  const kitFor = (side: string): Kit => (side === 'home' ? kits.home : kits.visitor);
  let markOf = new Map<string, Spoof['mark']>();
  const nameOf = (side: BenchSide) => teamOf(side).name;
  /** Sets the kits and marks for the match in play. */
  function dressTeams(): void {
    kits = matchKits(match.teams.home.color, match.teams.visitor.color);
    markOf = new Map(SIDES.flatMap((side) => TEAMS[side].map((s) => [s.id, s.mark] as const)));
  }

  let status: Status = 'mise';
  let seconds = 0;
  let lastTick = 0;
  let raf = 0;
  let match: Match = begin(newSeed());
  dressTeams();
  /** The opponent's moves in this scrum's mise, from the match's seed. */
  let moves: Random = miseRandom(match);
  /** The mise, and your spoof in hand: picked, dragged, or placed and still movable. */
  let hand: Hand = startHand(nextMise(match));
  /** The match score before the scrum being played, to add its live score to. */
  let scoreBefore: Readonly<Record<BenchSide, number>> = { home: 0, visitor: 0 };
  /**
   * The match as it was before the scrum being played. The match itself
   * already includes the break's recovery, which the bench shouldn't show
   * until the scrum is over (#57 review).
   */
  let matchBefore: Match = match;
  let miseRaf = 0;
  /** The opponent's latest placement, outlined so you can see where it went. */
  let justPlaced: string | null = null;
  /** When it was placed, on the page's clock: its outline fades from then (#76). */
  let justPlacedAt = 0;
  let fadeRaf = 0;
  /** How strongly the opponent's latest placement is outlined: 1, fading to 0 over 1.5 s. */
  function placedOutline(): number {
    return Math.max(0, 1 - (nowSeconds() - justPlacedAt) / PLACED_OUTLINE_SECONDS);
  }
  /** Redraws while the outline fades, then stops. */
  function fadeOutline(): void {
    cancelAnimationFrame(fadeRaf);
    const step = () => {
      if (status !== 'mise' || justPlaced === null) return;
      draw();
      if (placedOutline() > 0) fadeRaf = requestAnimationFrame(step);
      else justPlaced = null;
    };
    fadeRaf = requestAnimationFrame(step);
  }
  let computerTimer = 0;
  let scrum: Played | null = null;

  // --- Scoreboard ---------------------------------------------------------
  const board = el('div', 'scoreboard');
  const side = (bench: BenchSide) => {
    const block = el('div', `scoreboard-team scoreboard-${bench}`);
    const swatch = el('span', 'match-swatch');
    swatch.setAttribute('aria-hidden', 'true');
    const name = el('span', 'scoreboard-name');
    const score = el('span', 'scoreboard-score', '0');
    // The kit's swatch and the team's logo (#75) beside the score, at the
    // board's outer edge, where there's room: beside the name they squeezed a
    // long name, such as "Sacramento Pawns", on a phone.
    const logo = el('span', 'team-logo scoreboard-logo');
    logo.setAttribute('aria-hidden', 'true');
    const scoreRow = el('span', 'scoreboard-score-row');
    scoreRow.append(swatch, logo, score);
    // What the number counts: spoofs left to place in the mise, then points.
    const unit = el('span', 'scoreboard-unit', 'to place');
    block.append(name, scoreRow, unit);
    return { bench, block, swatch, logo, name, score, unit };
  };
  const home = side('home');
  const visitor = side('visitor');
  /** Each team's color, logo and name on the scoreboard, for the match in play. */
  function paintScoreboard(): void {
    for (const team of [home, visitor]) {
      team.swatch.style.background = kitFor(team.bench).fill;
      team.swatch.style.borderColor = kitFor(team.bench).trim;
      team.logo.textContent = teamOf(team.bench).logo;
      team.name.textContent = nameOf(team.bench);
    }
  }
  paintScoreboard();
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
  const pauseButton = el('button', 'button', 'Pause');
  pauseButton.type = 'button';
  controls.append(pauseButton);

  // --- The panel over the court: a scrum's result during the break (#58), and
  // the match scorecard at the end (#60) --------------------------------------
  const scrumPanel = el('section', 'scrum-result');
  scrumPanel.hidden = true;
  scrumPanel.setAttribute('aria-live', 'polite');
  const nextScrumButton = el('button', 'button button-primary', 'Next scrum');
  nextScrumButton.type = 'button';
  const playAgainButton = el('button', 'button button-primary', 'Play another match');
  playAgainButton.type = 'button';
  /** The canvas's size in CSS pixels, for sizing the panel. */
  let arenaSize = { width: 0, height: 0 };

  const root = el('div', 'match-screen');
  // The caption goes over the opponent's bench, inside the arena (rebuildCanvas).
  root.append(board, clockBar, turnStrip, stage, controls);

  // --- Drawing -------------------------------------------------------------
  /** How tired a spoof is now, carried from earlier scrums (#40). */
  function fatigueOf(team: BenchSide, id: string): number {
    const now = status === 'playing' || status === 'paused' ? matchBefore : match;
    return now.spoofs[team].find((m) => m.spoof.id === id)?.fatigue ?? 0;
  }

  /** Where each spoof is: on the court if placed (or playing), otherwise in its seat. */
  function onCourt(): ScrumFrame['spoofs'] {
    if (scrum) return frameAt(scrum.frames, seconds).spoofs;
    return hand.mise.placements.map((p) => ({
      id: p.spoofId,
      team: p.team,
      x: p.x,
      y: p.y,
      radius: p.radius,
      fatigue: fatigueOf(p.team, p.spoofId),
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
          mark: spoof.mark,
          kit: kitFor(team),
          // Tired spoofs on the bench show it, so you can choose who rests.
          fatigue: Math.min(100, fatigueOf(team, spoof.id)),
          highlighted: team === YOU && held.kind === 'picked' && held.spoof.id === spoof.id,
          // Your picked spoof's ring matches your countdown ring (the owner, on #76).
          highlightColor: palette.graceRing,
        });
      });
    }
    for (const s of spoofs) {
      const mark = markOf.get(s.id);
      if (!mark) continue;
      drawSpoofInArena(c, v, {
        x: s.x,
        y: s.y,
        radius: s.radius,
        mark,
        kit: kitFor(s.team),
        fatigue: Math.min(100, s.fatigue),
        highlighted: status === 'mise' && s.team === COMPUTER && s.id === justPlaced,
        highlightOpacity: placedOutline(),
      });
    }
    if (status === 'mise') drawHand(c, v);
    if (status === 'ready') drawScrumCue(c, v);
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
        mark: pending.spoof.mark,
        kit: kitFor(YOU),
        fatigue: Math.min(100, fatigueOf(YOU, pending.spoof.id)),
      });
      drawGraceRing(c, v, pending.spot, pending.spoof.radius, graceProgress(hand, nowSeconds()));
    }
    if (held.kind !== 'dragging') return;
    const landing = aim(hand, YOU);
    const disc = {
      radius: held.spoof.radius,
      mark: held.spoof.mark,
      kit: kitFor(YOU),
      fatigue: Math.min(100, fatigueOf(YOU, held.spoof.id)),
    };
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
    // The caption sits over the opponent's bench, where you'll see it whenever
    // the arena is on screen (the owner, #39): centered on the bench's middle
    // seat, and as wide as the bench. It lets every press through to the arena.
    const seats = benchSeats(COMPUTER);
    const middle = seats[Math.floor(seats.length / 2)];
    const xs = seats.map((seat) => seat.x);
    const benchWidth = Math.max(...xs) - Math.min(...xs) + 2 * BENCH_HALF_WIDTH;
    statusLine.style.top = `${String(view.cy + (middle?.y ?? 0) * view.scale)}px`;
    statusLine.style.width = `${String(benchWidth * view.scale * 0.94)}px`;
    // Its type scales with the arena, so the longest caption still fits on the
    // bench on a small phone: 12 px at the smallest, 16 px at full size.
    statusLine.style.fontSize = `${String(Math.min(16, Math.max(12, view.scale * 12.5)))}px`;
    const frame = el('div', 'arena-frame');
    arenaSize = { width, height };
    scrumPanel.style.fontSize = statusLine.style.fontSize;
    sizePanel();
    frame.append(canvas, statusLine, scrumPanel);
    stage.replaceChildren(frame);
    draw();
  }

  /**
   * Sizes the panel over the court. A scrum's result covers the court, a
   * little inside its edge; the match scorecard, with more to show, covers
   * the whole arena and scrolls within.
   */
  function sizePanel(): void {
    if (!view) return;
    const scorecard = status === 'done';
    scrumPanel.classList.toggle('scorecard', scorecard);
    scrumPanel.style.top = `${String(scorecard ? arenaSize.height / 2 : view.cy)}px`;
    scrumPanel.style.width = `${String(scorecard ? arenaSize.width * 0.96 : 2 * COURT_RADIUS * view.scale * 0.92)}px`;
    scrumPanel.style.maxHeight = scorecard ? `${String(arenaSize.height * 0.96)}px` : '';
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

  /** The caption over the opponent's bench: what to do, or why a spot is refused. Also read out to screen readers. */
  function miseMessage(): string {
    const turn = whoseTurn(hand.mise);
    if (!turn) return `All ${String(MISE_TURNS)} spoofs are placed. Scrum!`;
    if (turn === COMPUTER) return `The ${nameOf(COMPUTER)} are placing a spoof…`;
    const held = hand.held;
    const landing = aim(hand, YOU);
    if (landing?.kind === 'bench') return 'Let go to put it back on your bench.';
    if (landing?.kind === 'refused') return REFUSAL_TEXT[landing.refusal];
    if (landing?.kind === 'spot') {
      if (landing.inside) return 'Your one spot inside the red line.';
      if (landing.resisted) {
        return insideSpotsLeft(hand.mise, YOU) > 0
          ? 'Push past the red line to use your one spot inside.'
          : 'Your spot inside the red line is used, so it stops at the line.';
      }
      return 'Let go to place it here.';
    }
    if (hand.refusal) return REFUSAL_TEXT[hand.refusal];
    if (hand.pending) {
      return 'Placed. Before the ring fills, you can drag it elsewhere or back to your bench.';
    }
    if (held.kind === 'picked') {
      return `Tap the court to place ${held.spoof.name}, your ${shownTypeName(held.spoof.type).toLowerCase()}, or drag it there.`;
    }
    return 'Your turn: drag a spoof from your bench onto the court, or tap it and then a spot.';
  }

  /** Which scrum the screen is on, from 1: the next one during its mise, then the one just played. */
  function shownScrum(): number {
    const inMise = status === 'mise' || status === 'ready';
    return Math.min(scrumNumber(match) + (inMise ? 1 : 0), SCRUMS_PER_MATCH);
  }

  let lastLabelSecond = -1;
  function updateText(force = false): void {
    const of = `Scrum ${String(shownScrum())}/${String(SCRUMS_PER_MATCH)}`;
    const total = matchScore(match);
    if (status === 'mise' || status === 'ready') {
      middleLabel.textContent = `${of} · Mise`;
      const turn = Math.min(hand.mise.placements.length + 1, MISE_TURNS);
      clockText.textContent = `Turn ${String(turn)} of ${String(MISE_TURNS)}`;
      // The match score, with each team's spoofs left to place under it.
      home.score.textContent = String(total.home);
      visitor.score.textContent = String(total.visitor);
      home.unit.textContent = `${String(leftToPlace(hand.mise, 'home'))} to place`;
      visitor.unit.textContent = `${String(leftToPlace(hand.mise, 'visitor'))} to place`;
      clockBar.hidden = true;
      drawTurns();
      const state =
        status === 'ready'
          ? 'The mise is over.'
          : `Turn ${String(turn)} of ${String(MISE_TURNS)}: the ${nameOf(whoseTurn(hand.mise) ?? YOU)} place a spoof.`;
      stage.setAttribute(
        'aria-label',
        `The court, ${of}. ${state} ${nameOf('home')} have ${String(leftToPlace(hand.mise, 'home'))} to place, ${nameOf('visitor')} ${String(leftToPlace(hand.mise, 'visitor'))}. Match score: ${nameOf('home')} ${String(total.home)}, ${nameOf('visitor')} ${String(total.visitor)}.`,
      );
      return;
    }
    middleLabel.textContent = of;
    clockBar.hidden = status === 'settling' || status === 'break' || status === 'done';
    drawTurns();
    const left = Math.max(0, SCRUM_SECONDS - seconds);
    const playingNow = status === 'playing' || status === 'paused';
    const live = playingNow && scrum ? scoresAt(scrum.live, seconds) : null;
    // During a scrum, the match score so far plus this scrum's live estimate.
    const shown = live
      ? {
          home: scoreBefore.home + (live.teams.home ?? 0),
          visitor: scoreBefore.visitor + (live.teams.visitor ?? 0),
        }
      : total;
    home.score.textContent = String(shown.home);
    visitor.score.textContent = String(shown.visitor);
    home.unit.textContent = 'points';
    visitor.unit.textContent = 'points';
    clockText.textContent =
      status === 'done'
        ? 'Final'
        : status === 'break' || status === 'settling'
          ? 'Over'
          : `${left.toFixed(1)} s`;
    clockFill.style.width = `${String((left / SCRUM_SECONDS) * 100)}%`;
    const whole = Math.floor(seconds);
    if (!force && whole === lastLabelSecond) return;
    lastLabelSecond = whole;
    const score = `${nameOf('home')} ${home.score.textContent}, ${nameOf('visitor')} ${visitor.score.textContent}`;
    const state = {
      playing: `${of} playing, ${left.toFixed(0)} seconds left. ${score}.`,
      paused: `${of} paused, ${left.toFixed(0)} seconds left. ${score}.`,
      settling: `${of} over. Match score: ${score}.`,
      break: `${of} over. Match score: ${score}.`,
      done: `The match is over. Final score: ${score}.`,
    }[status];
    stage.setAttribute('aria-label', `The court. ${state}`);
  }

  /** Shows a caption; only when it changes, so a screen reader isn't flooded mid-drag. */
  function say(message: string): void {
    if (statusLine.textContent !== message) statusLine.textContent = message;
  }

  /** A points cell: the points, or a dot for a scrum the spoof sat out, read out as "sat out". */
  function pointsCell(points: number | null, className?: string): HTMLTableCellElement {
    const cell = el('td', className);
    if (points !== null) {
      cell.textContent = String(points);
      return cell;
    }
    const dot = el('span', 'scorecard-out', '•');
    dot.setAttribute('aria-hidden', 'true');
    cell.append(dot, el('span', 'visually-hidden', 'sat out'));
    return cell;
  }

  /** A header row: its label (text or elements), the 3 scrums, and Total. */
  function scrumHeaderRow(label: string | Node, className?: string): HTMLTableRowElement {
    const head = el('tr', className);
    const corner = el('th', 'scorecard-label');
    corner.scope = 'col';
    corner.append(label);
    head.append(corner);
    for (let n = 1; n <= SCRUMS_PER_MATCH; n += 1) {
      const th = el('th', undefined, String(n));
      th.scope = 'col';
      head.append(th);
    }
    const total = el('th', undefined, 'Total');
    total.scope = 'col';
    head.append(total);
    return head;
  }

  /**
   * The match scorecard over the arena (#60): who won, both teams' scores by
   * scrum, and each spoof's points by scrum, after the prototype's box score.
   * Outcomes only.
   */
  function showScorecard(): void {
    const card = matchScorecard(match);
    const you = card.teams[YOU];
    const them = card.teams[COMPUTER];
    const line = `${String(you.total)}–${String(them.total)}`;
    const title = {
      won: `You won, ${line}`,
      lost: `You lost, ${line}`,
      tied: `A tie, ${line}`,
    }[outcomeFor(match, YOU)];
    const heading = el('h2', 'scrum-result-title scorecard-title', title);
    heading.id = 'scorecard-title';
    scrumPanel.setAttribute('aria-labelledby', heading.id);

    // One table, so every column lines up (the owner, #60): the box score,
    // then each team's spoofs under a header row with its name.
    const body = el('div', 'scorecard-body');
    const table = el('table', 'scorecard-table');
    const box = el('tbody');
    box.append(scrumHeaderRow('Scrum'));
    for (const side of SIDES) {
      const team = card.teams[side];
      const row = el('tr');
      const name = el('th', 'scorecard-label');
      name.append(teamLogo(team.logo), `\u00a0${team.name}`);
      name.scope = 'row';
      row.append(name);
      for (const points of team.byScrum) row.append(pointsCell(points));
      row.append(el('td', 'scorecard-total', String(team.total)));
      box.append(row);
    }
    table.append(box);

    for (const side of SIDES) {
      const team = card.teams[side];
      const section = el('tbody', 'scorecard-team');
      const label = el('span', 'scorecard-spoof');
      const swatch = el('span', 'match-swatch');
      swatch.style.background = kitFor(side).fill;
      swatch.style.borderColor = kitFor(side).trim;
      swatch.setAttribute('aria-hidden', 'true');
      label.append(swatch, teamLogo(team.logo), el('span', undefined, team.name));
      section.append(scrumHeaderRow(label, 'scorecard-team-head'));
      for (const spoof of team.lines) {
        const row = el('tr');
        const name = el('th', 'scorecard-label');
        name.scope = 'row';
        const { canvas: disc, ctx: discCtx } = createCanvas(16, 16);
        disc.setAttribute('aria-hidden', 'true');
        drawSpoofDisc(discCtx, {
          x: 8,
          y: 8,
          radius: 6.5,
          mark: spoof.mark,
          kit: kitFor(side),
        });
        const who = el('span', 'scorecard-spoof');
        who.append(disc, spoofLabel(spoof));
        name.append(who);
        row.append(name);
        for (const points of spoof.byScrum) row.append(pointsCell(points));
        row.append(el('td', 'scorecard-total', String(spoof.total)));
        section.append(row);
      }
      table.append(section);
    }
    body.append(table);
    scrumPanel.replaceChildren(heading, body, playAgainButton);
  }

  function updateControls(): void {
    // Between scrums and at the end, the buttons are on the panel over the court (#58, #60).
    scrumPanel.hidden = status !== 'break' && status !== 'done';
    sizePanel();
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
  /** A new match: the same teams, a new seed, and so a new host (#40). Fatigue starts at 0. */
  function newMatch(): void {
    window.clearTimeout(computerTimer);
    cancelAnimationFrame(raf);
    cancelAnimationFrame(miseRaf);
    cancelAnimationFrame(fadeRaf);
    match = begin(newSeed());
    dressTeams();
    paintScoreboard();
    beginMise();
  }

  /** The result of the scrum just played, on the panel over the court (#58). Outcomes only. */
  function showScrumResult(): void {
    const summary = scrumSummary(match, scrumNumber(match) - 1);
    const heading = el(
      'h2',
      'scrum-result-title',
      `Scrum ${String(summary.scrum)} of ${String(SCRUMS_PER_MATCH)}`,
    );
    heading.id = 'scrum-result-title';
    scrumPanel.setAttribute('aria-labelledby', heading.id);

    const score = el('p', 'scrum-result-score');
    score.append(
      el('span', undefined, `${nameOf('home')} ${String(summary.score.home)}`),
      el('span', 'scrum-result-dash', '–'),
      el('span', undefined, `${String(summary.score.visitor)} ${nameOf('visitor')}`),
    );
    const total = el(
      'p',
      'scrum-result-match',
      `Match: ${String(summary.matchScore.home)}–${String(summary.matchScore.visitor)}`,
    );

    const teams = el('div', 'scrum-result-teams');
    for (const side of SIDES) {
      const list = el('ul', 'scrum-result-list');
      list.setAttribute('aria-label', nameOf(side));
      for (const line of summary.spoofs[side]) {
        const item = el('li', 'scrum-result-row');
        const { canvas: disc, ctx: discCtx } = createCanvas(18, 18);
        disc.setAttribute('aria-hidden', 'true');
        drawSpoofDisc(discCtx, {
          x: 9,
          y: 9,
          radius: 7,
          mark: line.mark,
          kit: kitFor(side),
        });
        const points =
          line.points === null
            ? el('span', 'scrum-result-out', 'sat out')
            : el('span', 'scrum-result-points', String(line.points));
        const label = spoofLabel(line);
        label.classList.add('scrum-result-name');
        item.append(disc, label, points);
        list.append(item);
      }
      teams.append(list);
    }
    scrumPanel.replaceChildren(heading, score, total, teams, nextScrumButton);
  }

  /** The next scrum's mise, with a new turn order. */
  function beginMise(): void {
    hand = startHand(nextMise(match));
    moves = miseRandom(match);
    justPlaced = null;
    scrum = null;
    seconds = 0;
    status = 'mise';
    say(miseMessage());
    refresh();
    nextTurn();
  }

  /** Moves the mise on: the opponent plays after a pause; on your turn it waits for a tap. */
  function nextTurn(): void {
    if (isMiseOver(hand.mise)) {
      // All placed: a quick cue, then the scrum starts by itself (the owner, #39).
      status = 'ready';
      say(miseMessage());
      refresh();
      computerTimer = window.setTimeout(startScrum, SCRUM_CUE_MS);
      return;
    }
    if (whoseTurn(hand.mise) !== COMPUTER) return;
    computerTimer = window.setTimeout(() => {
      const move = computerMove(hand.mise, COMPUTER, TEAMS[COMPUTER], moves);
      hand = { ...hand, mise: placeSpoof(hand.mise, move.spoof, COMPUTER, move.spot) };
      justPlaced = move.spoof.id;
      justPlacedAt = nowSeconds();
      say(miseMessage());
      refresh();
      fadeOutline();
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
    // No text selection or native drag from a press on the arena: with a
    // mouse, a selection made while dragging a spoof turned the next press
    // into a drag of the selected text, and the game never saw it.
    event.preventDefault();
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
      // A beat to see where the spoofs settled, before the result (#59).
      status = 'settling';
      say(`Scrum ${String(scrumNumber(match))} is over.`);
      refresh();
      computerTimer = window.setTimeout(() => {
        showOutcome(hadFocus);
      }, SETTLE_MS);
      return;
    }
    draw();
    updateText();
    raf = requestAnimationFrame(tick);
  }

  /**
   * After the beat: over the court, the scrum's result with Next scrum, or at
   * the match's end, the scorecard with Play another match. The panel says it
   * all, so the caption clears.
   */
  function showOutcome(hadFocus: boolean): void {
    say('');
    if (isMatchOver(match)) {
      status = 'done';
      recorder?.end(matchRecord(match));
      showScorecard();
    } else {
      status = 'break';
      // The scrum counts once you've seen it end: leaving during its playback doesn't credit it.
      recorder?.progress(matchRecord(match, { soFar: true }));
      showScrumResult();
    }
    refresh();
    // Pause hid when the scrum ended; keep a keyboard user on the controls.
    if (hadFocus) (status === 'break' ? nextScrumButton : playAgainButton).focus();
  }

  function run(): void {
    const hadFocus = scrumPanel.contains(document.activeElement);
    status = 'playing';
    say('Tap the court, or Pause, to pause.');
    lastTick = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
    updateControls();
    updateText(true);
    // The panel hides while it has focus; keep a keyboard user on the controls.
    if (hadFocus) pauseButton.focus();
  }

  function startScrum(): void {
    // Simulated from the match's seed; the starting frame shows each spoof as tired as it is.
    const entries = scrumEntries(match, hand.mise);
    scoreBefore = matchScore(match);
    matchBefore = match;
    // From its first scrum, leaving the match forfeits it (#90): not during the first mise.
    if (match.scrums.length === 0) recorder?.progress(matchRecord(match, { soFar: true }));
    match = playScrum(match, hand.mise);
    const played = match.scrums[match.scrums.length - 1];
    if (!played) throw new Error('No scrum was played');
    scrum = {
      frames: [startFrame(entries), ...played.result.frames],
      live: liveScores(played.result.frames),
      final: played.scores,
      entries,
    };
    seconds = 0;
    run();
    // If you left the page during the cue, it starts paused.
    if (document.hidden) pause();
  }

  function pause(): void {
    if (status !== 'playing') return;
    status = 'paused';
    say('Paused. Tap the court, or Resume, to carry on.');
    cancelAnimationFrame(raf);
    updateControls();
    updateText(true);
  }

  function togglePause(): void {
    if (status === 'playing') pause();
    else if (status === 'paused') run();
  }

  // --- Events -----------------------------------------------------------------
  playAgainButton.addEventListener('click', () => {
    if (status === 'done') newMatch();
  });
  nextScrumButton.addEventListener('click', () => {
    if (status === 'break') beginMise();
  });
  pauseButton.addEventListener('click', togglePause);
  /** Removes the listeners on the page, so a screen that's done with can be let go. */
  const listening = new AbortController();
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.hidden) pause();
    },
    { signal: listening.signal },
  );

  let lastWidth = -1;
  const resizing = new ResizeObserver(() => {
    if (stage.clientWidth === lastWidth) return;
    lastWidth = stage.clientWidth;
    rebuildCanvas();
  });
  resizing.observe(stage);

  newMatch();

  /**
   * Stops everything for good when the team changes (#78 review): the
   * opponent's and the "Scrum!" cue's timer, both animation loops, and the
   * listeners. Without it, leaving during the cue started a scrum offscreen.
   */
  function dispose(): void {
    window.clearTimeout(computerTimer);
    cancelAnimationFrame(raf);
    cancelAnimationFrame(miseRaf);
    cancelAnimationFrame(fadeRaf);
    listening.abort();
    resizing.disconnect();
  }

  return { element: root, hide: pause, dispose };
}

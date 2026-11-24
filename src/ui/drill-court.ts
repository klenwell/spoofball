import { kit, type Kit } from '../design/kits';
import type { TeamColorName } from '../design/tokens';
import type { Candidate } from '../game/combine';
import { courtRadius } from '../game/court';
import {
  DRILLER_ID,
  DRILL_COURT,
  drillNames,
  edgeFor,
  runDrill,
  type Direction,
  type DrillName,
  type DrillRun,
} from '../game/drills';
import type { ScrumFrame } from '../game/scrum';
import { SECONDS_PER_FRAME } from '../game/spoof-motion';
import type { ArenaView } from './arena-view';
import { drawCourtOnly, drawSpoofInArena } from './arena';
import { backingSize } from './canvas';
import { el } from './dom';
import { frameAt, startFrame } from './playback';

/**
 * The drill court (#73, wireframe 3 in docs/design.md): one candidate at a
 * time, with a tab for each drill. A drill plays as soon as its tab opens,
 * for about 3 seconds, and plays again on a tap of the court or **Run
 * again**. In teamwork, **Go left** and **Go right** send the spoof your
 * message, and each tap is a new run.
 *
 * Only the candidate's name and price show: no numbers about its skills or
 * how it did. Every run is a match simulation (`runDrill`), played back by
 * the combine's animation loop through `tick`.
 */

export interface DrillCourtOptions {
  readonly teamColor: TeamColorName;
  /** Draft or remove the candidate on the court. */
  readonly onDraft: (id: string) => void;
  /** Open the next candidate's drills. */
  readonly onNext: (id: string) => void;
  /** Back to the warm-ups. */
  readonly onBack: (id: string) => void;
}

/** Whether the candidate on the court is on your team, and if not, why it can't be drafted. */
export interface DraftState {
  readonly picked: boolean;
  /** Text saying why it can't be drafted now, or null. */
  readonly problem: string | null;
}

export interface DrillCourt {
  readonly element: HTMLElement;
  readonly heading: HTMLElement;
  /** Opens a candidate's drills, on its current tab. */
  open(candidate: Candidate, index: number, state: DraftState): void;
  /** Closes the court, stopping playback. */
  close(): void;
  /** Shows a change to the candidate's draft state, or a message. */
  update(candidate: Candidate, state: DraftState, message?: string): void;
  /** The candidate on the court, or null when it's closed. */
  readonly current: () => string | null;
  /** Moves playback on by this many seconds of real time, and draws. */
  tick(seconds: number): void;
  /** Redraws at the court's current size. */
  resize(): void;
}

const DRILL_LABELS: Readonly<Record<DrillName, string>> = {
  sprint: 'Sprint',
  blow: 'Blow',
  hold: 'Hold',
  teamwork: 'Teamwork',
};

/** What each drill shows, in words: no numbers. Sped-up drills say so. */
const DRILL_CAPTIONS: Readonly<Record<DrillName, string>> = {
  sprint: 'Dashes across the court and back, again and again: a whole scrum, sped up.',
  blow: 'Stands still and grows, through a whole scrum, sped up.',
  hold: 'Tries to stay in the middle while a dummy pushes it.',
  teamwork: 'Send it a message. Does it listen, and how soon does it get there?',
};

/**
 * The dummy in hold wears away, so it reads as an opponent, in purple (or
 * blue, if you're purple): colors that stand out on the red crush, unlike red.
 */
function dummyKit(teamColor: TeamColorName): Kit {
  return kit(teamColor === 'purple' ? 'blue' : 'purple', 'away');
}

function coins(price: number): string {
  return `${String(price)} ${price === 1 ? 'coin' : 'coins'}`;
}

export function createDrillCourt(options: DrillCourtOptions): DrillCourt {
  const { onDraft, onNext, onBack } = options;
  const teamKit = kit(options.teamColor, 'home');
  const otherKit = dummyKit(options.teamColor);

  const element = el('section', 'drill-court');
  element.hidden = true;
  const back = el('button', 'drill-back', 'Back to warm-ups');
  back.type = 'button';
  const heading = el('h2', 'drill-title');
  heading.tabIndex = -1;
  heading.id = 'drill-title';
  element.setAttribute('aria-labelledby', heading.id);
  const name = el('span', 'drill-name spoof-name');
  const price = el('span', 'drill-price');
  const priceText = el('span');
  priceText.setAttribute('aria-hidden', 'true');
  const priceSpoken = el('span', 'visually-hidden');
  price.append(priceText, priceSpoken);
  heading.append(name, price);

  // --- The drill tabs: arrow keys move between them (the ARIA tabs pattern).
  const tabList = el('div', 'drill-tabs');
  tabList.setAttribute('role', 'tablist');
  tabList.setAttribute('aria-label', 'Drills');
  const panel = el('div', 'drill-panel');
  panel.setAttribute('role', 'tabpanel');
  panel.id = 'drill-panel';
  const tabs = drillNames.map((drill) => {
    const tab = el('button', 'drill-tab', DRILL_LABELS[drill]);
    tab.type = 'button';
    tab.id = `drill-tab-${drill}`;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', panel.id);
    tab.addEventListener('click', () => {
      choose(drill);
    });
    tabList.append(tab);
    return { drill, tab };
  });
  tabList.addEventListener('keydown', (event) => {
    const at = drillNames.indexOf(drill);
    const moves: Record<string, number> = {
      ArrowRight: at + 1,
      ArrowLeft: at - 1,
      Home: 0,
      End: drillNames.length - 1,
    };
    const to = moves[event.key];
    if (to === undefined) return;
    event.preventDefault();
    const next = drillNames[(to + drillNames.length) % drillNames.length] ?? 'sprint';
    choose(next);
    tabs.find((t) => t.drill === next)?.tab.focus();
  });

  const canvas = el('canvas', 'drill-canvas');
  canvas.setAttribute('aria-hidden', 'true');
  const caption = el('p', 'drill-caption');
  const controls = el('div', 'drill-controls');
  const again = el('button', 'button', 'Run again');
  again.type = 'button';
  const goLeft = el('button', 'button', 'Go left');
  goLeft.type = 'button';
  const goRight = el('button', 'button', 'Go right');
  goRight.type = 'button';
  controls.append(again, goLeft, goRight);
  panel.append(canvas, caption, controls);

  const status = el('p', 'drill-status');
  status.setAttribute('role', 'status');
  const actions = el('div', 'drill-actions');
  const draft = el('button', 'button button-primary');
  draft.type = 'button';
  const next = el('button', 'button', 'Next candidate');
  next.type = 'button';
  actions.append(draft, next);
  element.append(back, heading, tabList, panel, status, actions);

  let candidate: Candidate | null = null;
  let index = 0;
  let drill: DrillName = 'sprint';
  let runs = 0;
  let run: DrillRun | null = null;
  let frames: ScrumFrame[] = [];
  /** Simulated seconds played so far. */
  let clock = 0;
  let ctx: CanvasRenderingContext2D | null = null;
  let size = 0;

  /** A new seed for every run, so each varies a little. */
  function seed(): number {
    runs += 1;
    return (Math.imul(index + 1, 0x9e3779b1) ^ Math.imul(runs, 0x85ebca6b) ^ Date.now()) >>> 0;
  }

  function start(direction?: Direction): void {
    if (!candidate) return;
    run = runDrill(candidate.spoof, drill, { seed: seed(), direction });
    frames = [startFrame(run.entries), ...run.result.frames];
    clock = 0;
    draw();
  }

  function choose(to: DrillName): void {
    drill = to;
    for (const { drill: d, tab } of tabs) {
      const selected = d === drill;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }
    panel.setAttribute('aria-labelledby', `drill-tab-${drill}`);
    caption.textContent = DRILL_CAPTIONS[drill];
    const teamwork = drill === 'teamwork';
    again.hidden = teamwork;
    goLeft.hidden = !teamwork;
    goRight.hidden = !teamwork;
    // Teamwork waits for your message; the others start at once.
    start();
  }

  again.addEventListener('click', () => {
    start();
  });
  goLeft.addEventListener('click', () => {
    start('left');
  });
  goRight.addEventListener('click', () => {
    start('right');
  });
  canvas.addEventListener('click', () => {
    if (drill !== 'teamwork') start();
  });
  back.addEventListener('click', () => {
    if (candidate) onBack(candidate.spoof.id);
  });
  draft.addEventListener('click', () => {
    if (candidate) onDraft(candidate.spoof.id);
  });
  next.addEventListener('click', () => {
    if (candidate) onNext(candidate.spoof.id);
  });

  function simulatedSeconds(): number {
    return Math.max(0, frames.length - 1) * SECONDS_PER_FRAME;
  }

  function draw(): void {
    if (!ctx || size === 0 || !candidate) return;
    const radius = courtRadius(DRILL_COURT);
    const view: ArenaView = { scale: size / (2 * radius + 8), cx: size / 2, cy: size / 2 };
    ctx.clearRect(0, 0, size, size);
    drawCourtOnly(ctx, view, DRILL_COURT);
    if (drill === 'teamwork') {
      // The two spots you can send it to.
      for (const side of [-1, 1] as const) {
        const spot = edgeFor(side, candidate.spoof.radius);
        ctx.beginPath();
        ctx.arc(
          view.cx + spot.x * view.scale,
          view.cy + spot.y * view.scale,
          candidate.spoof.radius * view.scale,
          0,
          Math.PI * 2,
        );
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = teamKit.trim;
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    if (frames.length === 0) return;
    const now = frameAt(frames, Math.min(clock, simulatedSeconds()));
    for (const spoof of now.spoofs) {
      const mine = spoof.id === DRILLER_ID;
      drawSpoofInArena(ctx, view, {
        x: spoof.x,
        y: spoof.y,
        radius: spoof.radius,
        type: mine ? candidate.spoof.type : 'pawn-basic',
        kit: mine ? teamKit : otherKit,
        fatigue: spoof.fatigue,
      });
    }
  }

  function resize(): void {
    const css = Math.floor(Math.min(panel.clientWidth, 360));
    if (css <= 0 || css === size) return;
    size = css;
    const backing = backingSize(css, css, window.devicePixelRatio);
    canvas.width = backing.width;
    canvas.height = backing.height;
    canvas.style.width = `${String(css)}px`;
    canvas.style.height = `${String(css)}px`;
    ctx = canvas.getContext('2d');
    ctx?.setTransform(backing.scale, 0, 0, backing.scale, 0, 0);
    draw();
  }

  function update(c: Candidate, state: DraftState, message?: string): void {
    candidate = c;
    name.textContent = c.spoof.name;
    priceText.textContent = `🪙 ${String(c.price)}`;
    priceSpoken.textContent = `, ${coins(c.price)}`;
    draft.textContent = state.picked ? 'Remove from team' : 'Draft this spoof';
    draft.setAttribute('aria-disabled', String(!state.picked && state.problem !== null));
    if (message !== undefined) status.textContent = message;
  }

  return {
    element,
    heading,
    open(c, at, state) {
      index = at;
      element.hidden = false;
      update(c, state, '');
      resize();
      choose(drill);
    },
    update,
    close() {
      element.hidden = true;
      run = null;
    },
    current: () => (element.hidden ? null : (candidate?.spoof.id ?? null)),
    tick(seconds) {
      if (element.hidden || !run) return;
      const end = simulatedSeconds();
      if (clock >= end) return;
      clock = Math.min(end, clock + seconds * run.speed);
      draw();
    },
    resize,
  };
}

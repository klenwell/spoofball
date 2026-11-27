import { kit } from '../design/kits';
import { moveSpoof } from '../game/pharm';
import { PROSPECTS } from '../game/roster';
import type { Team } from '../game/teams';
import { startWarmUp, stepWarmUp, warmUpSeed, type WarmUp } from '../game/warm-up';
import {
  STORAGE_PROBLEM_TEXT,
  type RosterResult,
  type SaveResult,
  type StatsResult,
} from '../storage/saved-team';
import type { Panel } from './app-shell';
import { el, newSeed, teamLogo } from './dom';
import { NEW_TEAM_HASH, cardHash } from './routes';
import { createSpoofCard, type SpoofCard } from './spoof-card';
import { hashFor } from './tabs';
import { spoofLabel } from './spoof-label';
import { draftPicksText, recordText, rosterOutcomeText } from './stats-text';
import {
  WARM_UP_FRAMES_PER_SECOND,
  WARM_UP_MAX_CATCH_UP,
  drawWarmUpCell,
  sizeCanvas,
} from './warm-up-cell';

/**
 * The Pharm tab's roster (#108, wireframe 1): your team and its record, your
 * draft picks, and a row for each spoof, moving in its cell as in the
 * combine, with its outcomes. Outcomes only (Decision 7).
 *
 * The rows' order is the bench order in the next match (the owner, #105):
 * drag a row by its handle, or use its Move up and Move down buttons. Each
 * change is saved at once, and not while a match is in progress.
 *
 * Tapping a row, or its name, opens the spoof's card (#109): the same screen
 * shows it, at `#/pharm/<id>`. "Re-draft the team" comes with #111: until
 * then, it isn't shown.
 */

export interface PharmScreenOptions {
  /** The team in play when the screen was built. */
  readonly team: Team;
  /** Whether it's the team saved in this browser: only it has a Pharm (#105). */
  readonly isSaved: boolean;
  readonly loadStats: () => StatsResult;
  readonly loadRoster: () => RosterResult;
  /** Whether a match is in progress: the order can't change then. */
  readonly matchInProgress: () => boolean;
  /** Saves the team as changed (a new order, a name, a mark) and puts it in play; says whether it was saved. */
  readonly onChange: (team: Team) => SaveResult;
}

/** A warm-up cell's size on the roster, in CSS px. */
const CELL_SIZE = 52;
/** At most this much real time moves a drill on in one frame, after a stall, as in the combine. */
const MAX_DRILL_STEP = 0.1;

interface Row {
  readonly id: string;
  readonly element: HTMLLIElement;
  readonly ctx: CanvasRenderingContext2D | null;
}

export function createPharmScreen(options: PharmScreenOptions): Panel {
  const { isSaved, loadStats, loadRoster, matchInProgress, onChange } = options;
  let team = options.team;
  const root = el('div', 'pharm-screen');
  const teamKit = kit(team.color, 'home');
  /** Each spoof's warm-up, by id, so a reorder doesn't restart it. */
  const warmUps = new Map<string, WarmUp>();
  const seed = newSeed();
  team.spoofs.forEach((s, i) => warmUps.set(s.id, startWarmUp(s, warmUpSeed(seed, i))));
  let rows: Row[] = [];
  /** The spoof card on screen (#109), or null for the roster. */
  let card: SpoofCard | null = null;
  /** A line under the roster when a new order couldn't be saved, until one is. */
  const message = el('p', 'pharm-message');
  message.setAttribute('role', 'status');

  function render(focus?: { id: string; button: 'up' | 'down' }): void {
    if (!isSaved) {
      root.replaceChildren(quickStartNote());
      rows = [];
      return;
    }
    const stats = loadStats();
    const roster = loadRoster();
    const locked = matchInProgress();
    const section = el('section', 'pharm-team');
    section.append(header(stats), picks(roster), rosterList(stats, locked));
    if (locked) {
      section.append(
        el('p', 'pharm-note', 'A match is in progress: finish it to change the order.'),
      );
    }
    section.append(message);
    root.replaceChildren(section);
    if (focus) {
      const row = rows.find((r) => r.id === focus.id);
      const button = row?.element.querySelector<HTMLButtonElement>(`.roster-move-${focus.button}`);
      // At an end, that button is disabled: the other one takes focus.
      const target =
        button && !button.disabled
          ? button
          : row?.element.querySelector<HTMLButtonElement>('.roster-move:not(:disabled)');
      target?.focus();
    }
    for (const row of rows) drawRow(row);
  }

  /** A spoof's card (#109), or the roster when the spoof isn't on the team, such as one replaced. */
  function renderCard(spoofId: string): void {
    if (!isSaved || !team.spoofs.some((s) => s.id === spoofId)) {
      // A real navigation, without a history entry: the shell routes to the
      // roster, with the tab's intro back (#120 review).
      window.location.replace(hashFor('pharm'));
      return;
    }
    const stats = loadStats();
    card = createSpoofCard({
      team,
      spoofId,
      stats: stats.ok ? stats.stats : null,
      locked: matchInProgress(),
      onChange: (next) => {
        const saved = onChange(next);
        if (saved.ok) team = next;
        return saved;
      },
    });
    rows = [];
    root.replaceChildren(card.element);
  }

  function header(stats: StatsResult): HTMLElement {
    const head = el('div', 'pharm-header');
    const name = el('h2', 'pharm-team-name');
    name.append(teamLogo(team.logo), ` ${team.name}`);
    const record = stats.ok
      ? `Record ${recordText(stats.stats.results)}`
      : "Your team's record couldn't be read.";
    head.append(name, el('p', 'pharm-record', record));
    return head;
  }

  function picks(roster: RosterResult): HTMLElement {
    const box = el('div', 'pharm-picks');
    if (!roster.ok) {
      box.append(el('p', 'pharm-picks-note', "Your draft picks couldn't be read."));
      return box;
    }
    const text = draftPicksText(roster.roster.prospects.length, PROSPECTS);
    const marks = el('span', 'pharm-picks-marks', text.marks);
    marks.setAttribute('aria-hidden', 'true');
    const line = el('p', 'pharm-picks-line');
    line.append(
      el('span', 'pharm-picks-title', 'Draft picks'),
      marks,
      el('span', 'visually-hidden', `${text.label}.`),
      el('span', 'pharm-picks-note', ` · ${text.note}`),
    );
    box.append(
      line,
      el('p', 'pharm-picks-help', 'Each loss brings a pick: a prospect you can scout.'),
    );
    return box;
  }

  function rosterList(stats: StatsResult, locked: boolean): HTMLElement {
    const list = el('ol', 'roster-list');
    list.setAttribute('aria-label', 'Your spoofs, in bench order');
    rows = team.spoofs.map((spoof, index) => {
      const item = el('li', 'roster-row');
      item.dataset.id = spoof.id;
      const handle = el('span', 'roster-handle', '⠿');
      handle.setAttribute('aria-hidden', 'true');
      handle.hidden = locked;
      const canvas = el('canvas', 'roster-cell');
      canvas.setAttribute('aria-hidden', 'true');
      const ctx = sizeCanvas(canvas, CELL_SIZE);
      const who = el('div', 'roster-who');
      const totals = stats.ok ? stats.stats.spoofs[spoof.id] : undefined;
      // The name opens the spoof's card (#109); so does a tap anywhere else on the row.
      const link = el('a', 'roster-name');
      link.href = cardHash(spoof.id);
      link.append(spoofLabel(spoof));
      item.addEventListener('click', (event) => {
        if (event.target instanceof Element && event.target.closest('a, button, .roster-handle'))
          return;
        window.location.hash = cardHash(spoof.id);
      });
      who.append(link, el('span', 'roster-outcomes', stats.ok ? rosterOutcomeText(totals) : ''));
      const moves = el('div', 'roster-moves');
      moves.append(
        moveButton(spoof.id, spoof.name, 'up', locked || index === 0),
        moveButton(spoof.id, spoof.name, 'down', locked || index === team.spoofs.length - 1),
      );
      item.append(handle, canvas, who, moves);
      if (!locked) dragByHandle(handle, item, list);
      return { id: spoof.id, element: item, ctx };
    });
    list.append(...rows.map((r) => r.element));
    return list;
  }

  function moveButton(
    id: string,
    name: string,
    way: 'up' | 'down',
    disabled: boolean,
  ): HTMLButtonElement {
    const button = el('button', `roster-move roster-move-${way}`, way === 'up' ? '▲' : '▼');
    button.type = 'button';
    button.disabled = disabled;
    button.setAttribute('aria-label', `Move ${name} ${way}`);
    button.addEventListener('click', () => {
      const index = team.spoofs.findIndex((s) => s.id === id);
      reorder(id, way === 'up' ? index - 1 : index + 1, { id, button: way });
    });
    return button;
  }

  /** Moves a spoof, saving the new order at once; on failure, the order stays and the reason shows. */
  function reorder(
    id: string,
    toIndex: number,
    focus?: { id: string; button: 'up' | 'down' },
  ): void {
    if (matchInProgress()) {
      render(focus);
      return;
    }
    const next = moveSpoof(team, id, toIndex);
    if (next === team) {
      render(focus);
      return;
    }
    const saved = onChange(next);
    if (saved.ok) {
      team = next;
      message.textContent = '';
    } else {
      message.textContent = `The new order couldn't be saved. ${STORAGE_PROBLEM_TEXT[saved.problem]}`;
    }
    render(focus);
  }

  /**
   * Drag a row by its handle: the row follows the pointer past its
   * neighbors' middles, and the order is saved when it's let go. Only the
   * handle takes the pointer (`touch-action: none` in app.css), so the rest
   * of the row still scrolls the page on a phone.
   */
  function dragByHandle(handle: HTMLElement, item: HTMLLIElement, list: HTMLOListElement): void {
    handle.addEventListener('pointerdown', (down) => {
      // Only the main button of the first pointer: a right-click's menu could
      // swallow the pointerup and leave the row following the mouse (#119 review).
      if (!down.isPrimary || down.button !== 0) return;
      down.preventDefault();
      item.classList.add('is-dragging');
      // Followed on the window, not by pointer capture: moving the row in the
      // page releases capture, which stopped a touch drag after one row.
      const drag = new AbortController();
      const ours = (event: PointerEvent) => event.pointerId === down.pointerId;
      window.addEventListener(
        'pointermove',
        (event) => {
          if (!ours(event)) return;
          // Past as many neighbors as the pointer has crossed, for a quick drag.
          for (;;) {
            const prev = item.previousElementSibling;
            const next = item.nextElementSibling;
            if (prev && event.clientY < middle(prev)) list.insertBefore(item, prev);
            else if (next && event.clientY > middle(next)) list.insertBefore(next, item);
            else break;
          }
        },
        { signal: drag.signal },
      );
      const end = (event: PointerEvent) => {
        if (!ours(event)) return;
        drag.abort();
        item.classList.remove('is-dragging');
        reorder(item.dataset.id ?? '', [...list.children].indexOf(item));
      };
      window.addEventListener('pointerup', end, { signal: drag.signal });
      window.addEventListener('pointercancel', end, { signal: drag.signal });
    });
  }

  function middle(element: Element): number {
    const box = element.getBoundingClientRect();
    return box.top + box.height / 2;
  }

  // --- The warm-ups ------------------------------------------------------------
  function drawRow(row: Row): void {
    const warmUp = warmUps.get(row.id);
    const spoof = team.spoofs.find((s) => s.id === row.id);
    if (!row.ctx || !warmUp || !spoof) return;
    drawWarmUpCell(row.ctx, CELL_SIZE, warmUp, spoof.mark, teamKit);
  }

  let raf = 0;
  let last = 0;
  let owed = 0;
  let running = false;

  function frame(now: number): void {
    if (!running) return;
    const elapsedSeconds = Math.max(0, (now - last) / 1000);
    owed += elapsedSeconds * WARM_UP_FRAMES_PER_SECOND;
    last = now;
    const steps = Math.min(Math.floor(owed), WARM_UP_MAX_CATCH_UP);
    owed = Math.min(owed - steps, 1);
    // Only the drills are clamped after a stall, as in the combine; warm-ups catch up.
    if (card) card.tick(Math.min(elapsedSeconds, MAX_DRILL_STEP), steps);
    else if (steps > 0) {
      for (const [id, warmUp] of warmUps) {
        let next = warmUp;
        for (let s = 0; s < steps; s += 1) next = stepWarmUp(next);
        warmUps.set(id, next);
      }
      for (const row of rows) drawRow(row);
    }
    raf = requestAnimationFrame(frame);
  }

  function start(): void {
    if (running || document.hidden || !isSaved) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function stop(): void {
    running = false;
    cancelAnimationFrame(raf);
  }

  const lifetime = new AbortController();
  let shown = false;
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.hidden) stop();
      else if (shown) start();
    },
    { signal: lifetime.signal },
  );

  return {
    element: root,
    // On a card, its spoof's name is the heading the shell moves focus to.
    get heading() {
      return card?.heading;
    },
    // `spoofId` opens that spoof's card (#109); without it, the roster.
    show: (spoofId?: string) => {
      shown = true;
      card?.dispose();
      card = null;
      if (spoofId === undefined) render();
      else renderCard(spoofId);
      start();
    },
    hide: () => {
      shown = false;
      stop();
      card?.dispose();
    },
    dispose: () => {
      shown = false;
      stop();
      card?.dispose();
      lifetime.abort();
    },
  };
}

/** For the quick start's Spoofs, who have no Pharm (#105). */
function quickStartNote(): HTMLElement {
  const note = el('div', 'stats-note');
  const create = el('a', 'button button-primary', 'Create your team');
  create.href = NEW_TEAM_HASH;
  note.append(
    el(
      'p',
      undefined,
      'The Pharm is for a team you create. Create your own team to manage its roster.',
    ),
    create,
  );
  return note;
}

import { kit, type Kit } from '../design/kits';
import { DRAFT_BUDGET, type Candidate } from '../game/combine';
import {
  budgetLeft,
  chooseMark,
  draftPool,
  draftedTeam,
  isDraftComplete,
  pickProblem,
  renameCandidate,
  renameProblem,
  togglePick,
  type Draft,
  type RenameProblem,
} from '../game/draft';
import { markNames, shownType, type MarkName } from '../game/spoof-types';
import { MAX_SPOOF_NAME_LENGTH, SPOOFS_PER_TEAM, type Team } from '../game/teams';
import { startWarmUp, stepWarmUp, warmUpSeed, type WarmUp } from '../game/warm-up';
import { STORAGE_PROBLEM_TEXT, type SaveResult } from '../storage/saved-team';
import type { Panel } from './app-shell';
import { el } from './dom';
import { createDrillCourt, type DraftState } from './drill-court';
import { replaceDialog } from './replace-dialog';
import { NEW_TEAM_HASH } from './routes';
import { drawSpoofDisc } from './spoof-disc';
import { MARK_LABELS } from './spoof-label';
import {
  WARM_UP_FRAMES_PER_SECOND,
  WARM_UP_MAX_CATCH_UP,
  drawWarmUpCell,
  sizeCanvas,
} from './warm-up-cell';

/**
 * The combine (#72, wireframe 2 in docs/design.md): the pool's 10 candidates,
 * each warming up in its own cell with its name and price, and your picks in
 * a strip below, filling to 5, with the budget left. Tap a cell to open its
 * drills (#73, wireframe 3), where you draft it or remove it; a pick over
 * budget, or a sixth, isn't made, and the screen says why. On a phone the
 * drill court takes the screen; on a wide one it opens beside the warm-ups.
 * You can rename a pick in the strip, and tap its disc to give it any of
 * the 16 marks (#74). **Done** saves your team and plays it,
 * after a last check if it replaces your saved team.
 *
 * Every change is saved as it happens (`onChange`), so a reload brings back
 * the same pool and picks. No skills or formula show: only names, types (by
 * the mark) and prices.
 */

export interface CombineOptions {
  readonly draft: Draft;
  /** The team saved now, which the drafted team replaces. */
  readonly savedTeam: Team | null;
  /** Keeps the draft as it changes; says whether it was saved. */
  readonly onChange: (draft: Draft) => SaveResult;
  /** Saves the finished team, ending the draft; says whether it was saved. */
  readonly onFinish: (team: Team) => SaveResult;
  /** Plays the finished team. */
  readonly onPlay: (team: Team, saved: boolean) => void;
}

/** Warm-ups run at the match's own frame rate. */
const FRAMES_PER_SECOND = WARM_UP_FRAMES_PER_SECOND;
/** At most this many frames are caught up in one draw, after a stall. */
const MAX_CATCH_UP = WARM_UP_MAX_CATCH_UP;
/** At most this much real time moves a drill on in one draw, after a stall. */
const MAX_DRILL_STEP = 0.1;

const RENAME_PROBLEM_TEXT: Readonly<Record<RenameProblem, string>> = {
  empty: 'A spoof needs a name.',
  long: `A name can be up to ${String(MAX_SPOOF_NAME_LENGTH)} characters.`,
  taken: 'Another spoof in the combine has that name.',
};

const DRAFT_NOT_SAVED_TEXT =
  "Your draft can't be saved in this browser, so it will be lost if you leave or reload.";

function typeName(candidate: Candidate): string {
  return shownType(candidate.spoof.type);
}

function coins(price: number): string {
  return `${String(price)} ${price === 1 ? 'coin' : 'coins'}`;
}

/** A small disc wearing a mark, in your kit: for a pick in the strip, and the mark picker. */
function discCanvas(mark: MarkName, teamKit: Kit, css = 22): HTMLCanvasElement {
  const canvas = el('canvas', 'combine-pick-disc');
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = sizeCanvas(canvas, css);
  if (ctx)
    drawSpoofDisc(ctx, {
      x: css / 2,
      y: css / 2,
      radius: css / 2 - 2,
      mark,
      kit: teamKit,
    });
  return canvas;
}

export function createCombineScreen(options: CombineOptions): Panel {
  const { savedTeam, onChange, onFinish, onPlay } = options;
  let draft = options.draft;
  let pool = draftPool(draft);
  const teamKit = kit(draft.color, 'home');

  const element = el('section', 'combine');
  const heading = el('h1', 'screen-title', 'Combine');
  heading.tabIndex = -1;
  const top = el('div', 'combine-top');
  const counter = el('p', 'combine-counter');
  top.append(heading, counter);
  const intro = el(
    'p',
    'combine-intro',
    `Watch them warm up, and tap one to run its drills. Pick ${String(SPOOFS_PER_TEAM)} for ${draft.logo} ${draft.name}. A price is only a rough guide.`,
  );
  const storageNotice = el('p', 'notice');
  storageNotice.setAttribute('role', 'status');
  const budget = el('p', 'combine-budget');

  // --- The candidates' cells -------------------------------------------------
  const grid = el('ul', 'combine-grid');
  grid.setAttribute('aria-label', 'Candidates');
  const cells = pool.map((candidate) => {
    const item = el('li', 'combine-item');
    const button = el('button', 'combine-cell');
    button.type = 'button';
    button.dataset.id = candidate.spoof.id;
    const canvas = el('canvas', 'combine-canvas');
    canvas.setAttribute('aria-hidden', 'true');
    const name = el('span', 'combine-name spoof-name');
    const price = el('span', 'combine-price');
    button.append(canvas, name, price);
    item.append(button);
    grid.append(item);
    button.addEventListener('click', () => {
      openDrills(candidate.spoof.id);
    });
    return {
      id: candidate.spoof.id,
      button,
      canvas,
      name,
      price,
      ctx: null as CanvasRenderingContext2D | null,
      size: 0,
    };
  });
  const message = el('p', 'combine-message');
  message.setAttribute('role', 'status');

  // --- Your picks ------------------------------------------------------------
  const picksSection = el('section', 'combine-picks');
  const picksTitle = el('h2', 'combine-picks-title', 'Your team');
  picksTitle.id = 'combine-picks-title';
  picksSection.setAttribute('aria-labelledby', picksTitle.id);
  const picksList = el('ol', 'combine-pick-list');
  const renameError = el('p', 'field-error');
  renameError.hidden = true;
  renameError.setAttribute('role', 'alert');
  picksSection.append(picksTitle, picksList, renameError);

  const actions = el('div', 'form-actions');
  const back = el('a', 'button', 'Back');
  back.href = NEW_TEAM_HASH;
  const done = el('button', 'button button-primary');
  done.type = 'button';
  actions.append(back, done);

  const main = el('div', 'combine-main');
  main.append(top, intro, storageNotice, budget, grid, message, picksSection, actions);

  // --- The drill court (#73) -------------------------------------------------
  const drills = createDrillCourt({
    teamColor: draft.color,
    onDraft: (id) => {
      const text = choose(id);
      const c = candidate(id);
      if (c) drills.update(c, draftState(id), text);
    },
    onNext: (id) => {
      const at = pool.findIndex((c) => c.spoof.id === id);
      const next = pool[(at + 1) % pool.length];
      if (next) openDrills(next.spoof.id);
    },
    onBack: (id) => {
      closeDrills(id);
    },
  });
  drills.element.addEventListener('keydown', (event) => {
    const id = drills.current();
    if (event.key === 'Escape' && id) closeDrills(id);
  });
  element.append(main, drills.element);
  const confirm = savedTeam ? replaceDialog(savedTeam) : null;
  if (confirm) element.append(confirm.element);

  storageNotice.hidden = true;
  function showSaved(result: SaveResult): void {
    const failed = !result.ok && result.problem !== 'invalid';
    storageNotice.textContent = failed ? DRAFT_NOT_SAVED_TEXT : '';
    storageNotice.hidden = !failed;
  }

  /** Records a change to the draft: saved, then shown. */
  function change(next: Draft): void {
    if (next === draft) return;
    draft = next;
    pool = draftPool(draft);
    showSaved(onChange(draft));
    render();
  }

  function candidate(id: string): Candidate | undefined {
    return pool.find((c) => c.spoof.id === id);
  }

  /**
   * Why a candidate can't be drafted now, in words, or null. No numbers: the
   * drill court shows only the price (#73).
   */
  function problemText(id: string): string | null {
    const c = candidate(id);
    if (!c) return null;
    const problem = pickProblem(draft, pool, id);
    if (problem === 'full') {
      return `You've picked ${String(SPOOFS_PER_TEAM)}. Remove one to draft ${c.spoof.name}.`;
    }
    if (problem === 'over-budget') return `${c.spoof.name} costs more than you have left.`;
    return null;
  }

  function draftState(id: string): DraftState {
    return { picked: draft.picks.includes(id), problem: problemText(id) };
  }

  /** Picks or unpicks a candidate, and says what happened. */
  function choose(id: string): string {
    const picked = draft.picks.includes(id);
    const c = candidate(id);
    if (!c) return '';
    const problem = problemText(id);
    const text = problem ?? (picked ? `Removed ${c.spoof.name}.` : `Drafted ${c.spoof.name}.`);
    message.textContent = text;
    if (!problem) change(togglePick(draft, pool, id));
    return text;
  }

  function openDrills(id: string): void {
    const at = pool.findIndex((c) => c.spoof.id === id);
    const c = pool[at];
    if (!c) return;
    element.classList.add('is-drilling');
    markOpen(id);
    drills.open(c, at, draftState(id));
    drills.heading.focus();
  }

  function closeDrills(id: string): void {
    drills.close();
    element.classList.remove('is-drilling');
    markOpen(null);
    cells.find((cell) => cell.id === id)?.button.focus();
  }

  /** Highlights the cell of the candidate whose drills are open, beside the drill court. */
  function markOpen(id: string | null): void {
    for (const cell of cells) {
      const open = cell.id === id;
      cell.button.classList.toggle('is-drilling', open);
      if (open) cell.button.setAttribute('aria-current', 'true');
      else cell.button.removeAttribute('aria-current');
    }
  }

  function rename(id: string, input: HTMLInputElement): void {
    const problem = renameProblem(pool, id, input.value);
    if (problem) {
      renameError.textContent = RENAME_PROBLEM_TEXT[problem];
      renameError.hidden = false;
      input.setAttribute('aria-invalid', 'true');
      return;
    }
    renameError.hidden = true;
    input.removeAttribute('aria-invalid');
    change(renameCandidate(draft, pool, id, input.value));
  }

  /** The pick whose mark picker is open, or null. */
  let pickerOpen: string | null = null;
  /** After a re-render, the pick whose mark button gets focus back. */
  let pickerFocus: string | null = null;

  /**
   * A pick's mark button (#74): its disc, which opens the 16 marks below
   * the row. Any mark, even one a teammate wears.
   */
  function markButton(c: Candidate): HTMLButtonElement {
    const id = c.spoof.id;
    const button = el('button', 'combine-pick-mark');
    button.type = 'button';
    button.dataset.id = id;
    button.setAttribute('aria-expanded', String(pickerOpen === id));
    button.setAttribute('aria-controls', `mark-picker-${id}`);
    button.setAttribute(
      'aria-label',
      `Mark for ${c.spoof.name}: ${MARK_LABELS[c.spoof.mark]}. Change`,
    );
    button.append(discCanvas(c.spoof.mark, teamKit, 28));
    button.addEventListener('click', () => {
      pickerOpen = pickerOpen === id ? null : id;
      pickerFocus = id;
      render();
    });
    return button;
  }

  /** The 16 marks for a pick, as a group of buttons; the one it wears is pressed. */
  function markPicker(c: Candidate): HTMLElement {
    const id = c.spoof.id;
    const picker = el('div', 'combine-mark-picker');
    picker.id = `mark-picker-${id}`;
    picker.setAttribute('role', 'group');
    picker.setAttribute('aria-label', `Marks for ${c.spoof.name}`);
    for (const mark of markNames) {
      const option = el('button', 'combine-mark-option');
      option.type = 'button';
      option.setAttribute('aria-label', MARK_LABELS[mark]);
      option.setAttribute('aria-pressed', String(c.spoof.mark === mark));
      option.title = MARK_LABELS[mark];
      option.append(discCanvas(mark, teamKit, 32));
      option.addEventListener('click', () => {
        pickerOpen = null;
        pickerFocus = id;
        // A new mark re-renders through `change`; the same mark still closes the picker.
        const next = chooseMark(draft, pool, id, mark);
        if (next === draft) render();
        else change(next);
      });
      picker.append(option);
    }
    picker.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      // Close the picker, not the drill court.
      event.stopPropagation();
      pickerOpen = null;
      pickerFocus = id;
      render();
    });
    return picker;
  }

  function pickRow(c: Candidate): HTMLLIElement {
    const row = el('li', 'combine-pick');
    const input = el('input', 'field-input combine-pick-name');
    input.value = c.spoof.name;
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.maxLength = MAX_SPOOF_NAME_LENGTH * 4;
    input.setAttribute('aria-label', `Name for your ${typeName(c)}, ${c.spoof.name}`);
    input.addEventListener('change', () => {
      rename(c.spoof.id, input);
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') rename(c.spoof.id, input);
    });
    const price = el('span', 'combine-pick-price', String(c.price));
    price.setAttribute('aria-label', coins(c.price));
    const remove = el('button', 'combine-pick-remove', '×');
    remove.type = 'button';
    remove.setAttribute('aria-label', `Remove ${c.spoof.name}`);
    remove.addEventListener('click', () => {
      choose(c.spoof.id);
      // The row is gone: keep focus nearby.
      (picksList.querySelector<HTMLButtonElement>('.combine-pick-remove') ?? done).focus();
    });
    row.append(markButton(c), input, price, remove);
    if (pickerOpen === c.spoof.id) row.append(markPicker(c));
    return row;
  }

  function render(): void {
    // A pick that leaves the team (× here, or Remove on the drill court) takes its open picker with it.
    if (pickerOpen !== null && !draft.picks.includes(pickerOpen)) pickerOpen = null;
    const left = budgetLeft(draft, pool);
    const full = draft.picks.length >= SPOOFS_PER_TEAM;
    counter.textContent = `${String(draft.picks.length)} / ${String(SPOOFS_PER_TEAM)}`;
    counter.setAttribute(
      'aria-label',
      `${String(draft.picks.length)} of ${String(SPOOFS_PER_TEAM)} picked`,
    );
    budget.textContent = `Budget left: ${String(left)} of ${String(DRAFT_BUDGET)} coins`;
    for (const cell of cells) {
      const c = candidate(cell.id);
      if (!c) continue;
      const picked = draft.picks.includes(cell.id);
      const outOfReach = !picked && (full || c.price > left);
      cell.name.textContent = c.spoof.name;
      cell.price.textContent = `🪙 ${String(c.price)}`;
      cell.button.classList.toggle('is-picked', picked);
      cell.button.classList.toggle('is-out-of-reach', outOfReach);
      const note = picked
        ? ', on your team'
        : outOfReach && !full
          ? ', more than you have left'
          : '';
      cell.button.setAttribute(
        'aria-label',
        `${c.spoof.name}, ${typeName(c)}, ${coins(c.price)}${note}. Open drills`,
      );
    }
    // The strip: your picks in order, then an empty slot for each still to pick.
    const rows: HTMLLIElement[] = draft.picks.flatMap((id) => {
      const c = candidate(id);
      return c ? [pickRow(c)] : [];
    });
    for (let i = rows.length; i < SPOOFS_PER_TEAM; i += 1) {
      const slot = el('li', 'combine-pick is-empty');
      slot.append(el('span', 'combine-pick-slot', 'Empty'));
      rows.push(slot);
    }
    const focused = document.activeElement;
    const keepFocus =
      focused instanceof HTMLInputElement && picksList.contains(focused) ? focused.value : null;
    picksList.replaceChildren(...rows);
    if (keepFocus !== null) {
      // A rename re-renders the strip: put focus back in the same row.
      const inputs = [...picksList.querySelectorAll('input')];
      inputs.find((i) => i.value === keepFocus.trim())?.focus();
    }
    if (pickerFocus !== null) {
      // Opening or closing a mark picker re-renders the strip: focus its first
      // mark when it opens, and the mark button again when it closes.
      const id = pickerFocus;
      pickerFocus = null;
      const target =
        pickerOpen === id
          ? picksList.querySelector<HTMLButtonElement>(`#mark-picker-${id} [aria-pressed='true']`)
          : picksList.querySelector<HTMLButtonElement>(`.combine-pick-mark[data-id='${id}']`);
      target?.focus();
    }
    const complete = isDraftComplete(draft);
    // Short, so it fits beside Back on a phone: the counter says how many are picked,
    // and a tap before 5 says what's missing.
    done.textContent = 'Done';
    done.setAttribute('aria-disabled', String(!complete));
    const open = drills.current();
    const onCourt = open ? candidate(open) : undefined;
    if (open && onCourt) drills.update(onCourt, draftState(open));
  }

  /** A team that couldn't be saved, waiting for "Play anyway". */
  let unsaved: Team | null = null;

  function finish(team: Team): void {
    const result = onFinish(team);
    // Where the browser saves nothing at all, the screen has said so from the start: just play.
    // Full storage gets its own message, and Play anyway.
    if (result.ok || result.problem === 'unavailable') {
      onPlay(team, result.ok);
      return;
    }
    unsaved = team;
    storageNotice.textContent = `${STORAGE_PROBLEM_TEXT[result.problem]} You can still play it now.`;
    storageNotice.hidden = false;
    done.textContent = 'Play anyway';
  }

  done.addEventListener('click', () => {
    if (unsaved) {
      onPlay(unsaved, false);
      return;
    }
    const team = draftedTeam(draft);
    if (!team) {
      message.textContent = `Pick ${String(SPOOFS_PER_TEAM)} spoofs to finish: you have ${String(draft.picks.length)}.`;
      return;
    }
    if (confirm) {
      confirm.open(`${draft.logo} ${draft.name}`, () => {
        finish(team);
      });
    } else finish(team);
  });

  // --- The warm-ups ------------------------------------------------------------
  const warmUps: WarmUp[] = pool.map((c, i) => startWarmUp(c.spoof, warmUpSeed(draft.seed, i)));
  let raf = 0;
  let last = 0;
  let owed = 0;
  let running = false;

  function drawCell(index: number): void {
    const cell = cells[index];
    const warmUp = warmUps[index];
    if (!cell?.ctx || !warmUp || cell.size === 0) return;
    // A mark you chose shows at once: the pool has it, the warm-up doesn't.
    const mark = candidate(cell.id)?.spoof.mark ?? warmUp.spoof.mark;
    drawWarmUpCell(cell.ctx, cell.size, warmUp, mark, teamKit);
  }

  function frame(now: number): void {
    if (!running) return;
    const elapsed = Math.max(0, (now - last) / 1000);
    owed += elapsed * FRAMES_PER_SECOND;
    last = now;
    drills.tick(Math.min(elapsed, MAX_DRILL_STEP));
    const steps = Math.min(Math.floor(owed), MAX_CATCH_UP);
    owed = Math.min(owed - steps, 1);
    for (let i = 0; i < warmUps.length; i += 1) {
      let warmUp = warmUps[i];
      if (!warmUp) continue;
      for (let s = 0; s < steps; s += 1) warmUp = stepWarmUp(warmUp);
      warmUps[i] = warmUp;
      if (steps > 0) drawCell(i);
    }
    raf = requestAnimationFrame(frame);
  }

  function start(): void {
    if (running || document.hidden) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function stop(): void {
    running = false;
    cancelAnimationFrame(raf);
  }

  const lifetime = new AbortController();
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.hidden) stop();
      else start();
    },
    { signal: lifetime.signal },
  );

  // Cells are sized by the grid's layout; the canvases follow it.
  const resize = new ResizeObserver(() => {
    cells.forEach((cell, i) => {
      const size = Math.floor(cell.button.clientWidth - 12);
      if (size <= 0 || size === cell.size) return;
      cell.size = size;
      cell.ctx = sizeCanvas(cell.canvas, size);
      drawCell(i);
    });
  });
  resize.observe(grid);
  const drillResize = new ResizeObserver(() => {
    drills.resize();
  });
  drillResize.observe(drills.element);

  // Saving the draft as the screen opens tells whether this browser saves at all.
  showSaved(onChange(draft));
  render();
  start();

  function dispose(): void {
    stop();
    lifetime.abort();
    resize.disconnect();
    drillResize.disconnect();
    if (confirm?.element.open) confirm.element.close();
  }

  return { element, heading, hide: dispose, dispose };
}

import { kit, type Kit } from '../design/kits';
import { palette } from '../design/tokens';
import { DRAFT_BUDGET, type Candidate } from '../game/combine';
import { courtRadius } from '../game/court';
import {
  budgetLeft,
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
import { avatarOf } from '../game/spoof-types';
import { FRAMES_PER_SCRUM, SCRUM_SECONDS } from '../game/spoof-motion';
import { MAX_SPOOF_NAME_LENGTH, SPOOFS_PER_TEAM, type Team } from '../game/teams';
import { WARM_UP_CELL, startWarmUp, stepWarmUp, warmUpSeed, type WarmUp } from '../game/warm-up';
import { STORAGE_PROBLEM_TEXT, type SaveResult } from '../storage/saved-team';
import type { Panel } from './app-shell';
import { backingSize } from './canvas';
import { el } from './dom';
import { replaceDialog } from './replace-dialog';
import { NEW_TEAM_HASH } from './routes';
import { drawSpoofDisc } from './spoof-disc';

/**
 * The combine (#72, wireframe 2 in docs/design.md): the pool's 10 candidates,
 * each warming up in its own cell with its name and price, and your picks in
 * a strip below, filling to 5, with the budget left. Tap a cell to pick or
 * unpick it; a pick over budget, or a sixth, isn't made, and the screen says
 * why. You can rename a pick in the strip. **Done** saves your team and plays
 * it, after a last check if it replaces your saved team.
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
const FRAMES_PER_SECOND = FRAMES_PER_SCRUM / SCRUM_SECONDS;
/** At most this many frames are caught up in one draw, after a stall. */
const MAX_CATCH_UP = 4;

const RENAME_PROBLEM_TEXT: Readonly<Record<RenameProblem, string>> = {
  empty: 'A spoof needs a name.',
  long: `A name can be up to ${String(MAX_SPOOF_NAME_LENGTH)} characters.`,
  taken: 'Another spoof in the combine has that name.',
};

const DRAFT_NOT_SAVED_TEXT =
  "Your draft can't be saved in this browser, so it will be lost if you leave or reload.";

function typeName(candidate: Candidate): string {
  return avatarOf(candidate.spoof.type);
}

function coins(price: number): string {
  return `${String(price)} ${price === 1 ? 'coin' : 'coins'}`;
}

/** A canvas sized to `css` pixels square, drawn at the screen's pixel ratio. */
function sizeCanvas(canvas: HTMLCanvasElement, css: number): CanvasRenderingContext2D | null {
  const size = backingSize(css, css, window.devicePixelRatio);
  if (canvas.width !== size.width) canvas.width = size.width;
  if (canvas.height !== size.height) canvas.height = size.height;
  canvas.style.width = `${String(css)}px`;
  canvas.style.height = `${String(css)}px`;
  const ctx = canvas.getContext('2d');
  ctx?.setTransform(size.scale, 0, 0, size.scale, 0, 0);
  return ctx;
}

/** A small disc for a pick in the strip. */
function discCanvas(candidate: Candidate, teamKit: Kit): HTMLCanvasElement {
  const canvas = el('canvas', 'combine-pick-disc');
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = sizeCanvas(canvas, 22);
  if (ctx)
    drawSpoofDisc(ctx, { x: 11, y: 11, radius: 9, type: candidate.spoof.type, kit: teamKit });
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
    `Watch them warm up, then pick ${String(SPOOFS_PER_TEAM)} for ${draft.logo} ${draft.name}. A price is only a rough guide.`,
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
      choose(candidate.spoof.id);
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

  element.append(top, intro, storageNotice, budget, grid, message, picksSection, actions);
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

  function choose(id: string): void {
    const picked = draft.picks.includes(id);
    const problem = pickProblem(draft, pool, id);
    const c = candidate(id);
    if (!c) return;
    if (problem === 'full') {
      message.textContent = `You've picked ${String(SPOOFS_PER_TEAM)}. Remove one to pick ${c.spoof.name}.`;
      return;
    }
    if (problem === 'over-budget') {
      message.textContent = `${c.spoof.name} costs ${coins(c.price)}, and you have ${coins(budgetLeft(draft, pool))} left.`;
      return;
    }
    message.textContent = picked ? `Removed ${c.spoof.name}.` : `Picked ${c.spoof.name}.`;
    change(togglePick(draft, pool, id));
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
    row.append(discCanvas(c, teamKit), input, price, remove);
    return row;
  }

  function render(): void {
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
      cell.button.setAttribute('aria-pressed', String(picked));
      cell.button.classList.toggle('is-picked', picked);
      cell.button.classList.toggle('is-out-of-reach', outOfReach);
      cell.button.setAttribute(
        'aria-label',
        `${c.spoof.name}, ${typeName(c)}, ${coins(c.price)}${outOfReach && !full ? ', more than you have left' : ''}`,
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
    const complete = isDraftComplete(draft);
    // Short, so it fits beside Back on a phone: the counter says how many are picked,
    // and a tap before 5 says what's missing.
    done.textContent = 'Done';
    done.setAttribute('aria-disabled', String(!complete));
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
    const { ctx, size } = cell;
    const scale = size / (2 * courtRadius(WARM_UP_CELL) + 4);
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.beginPath();
    ctx.arc(0, 0, courtRadius(WARM_UP_CELL) * scale, 0, Math.PI * 2);
    ctx.fillStyle = palette.mosh;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = palette.courtEdge;
    ctx.stroke();
    ctx.restore();
    drawSpoofDisc(ctx, {
      x: size / 2 + warmUp.position.x * scale,
      y: size / 2 + warmUp.position.y * scale,
      radius: warmUp.spoof.radius * scale,
      type: warmUp.spoof.type,
      kit: teamKit,
    });
  }

  function frame(now: number): void {
    if (!running) return;
    owed += ((now - last) / 1000) * FRAMES_PER_SECOND;
    last = now;
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

  // Saving the draft as the screen opens tells whether this browser saves at all.
  showSaved(onChange(draft));
  render();
  start();

  function dispose(): void {
    stop();
    lifetime.abort();
    resize.disconnect();
    if (confirm?.element.open) confirm.element.close();
  }

  return { element, heading, hide: dispose, dispose };
}

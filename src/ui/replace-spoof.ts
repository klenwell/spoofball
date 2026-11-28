import { kit } from '../design/kits';
import { canDraft } from '../game/pharm';
import { PROSPECTS, type Roster } from '../game/roster';
import type { Team } from '../game/teams';
import { startWarmUp, stepWarmUp, warmUpSeed, type WarmUp } from '../game/warm-up';
import { STORAGE_PROBLEM_TEXT, type SwapProblem, type SwapResult } from '../storage/saved-team';
import { el, newSeed } from './dom';
import { createDrillCourt } from './drill-court';
import { cardHash } from './routes';
import { spoofLabel } from './spoof-label';
import { draftPicksText } from './stats-text';
import { drawWarmUpCell, sizeCanvas } from './warm-up-cell';

/**
 * Replacing a spoof (#110, wireframe 3), at `#/pharm/<id>/replace`: your
 * prospects, which are your draft picks, each warming up in its cell as in
 * the combine. Tap one to pick it and run its drills. With 3, **Swap in**
 * puts the picked prospect in the spoof's place, after a confirmation, and
 * cleans the slate (the owner, #105). With fewer, you can scout the ones
 * you have. Only between matches.
 *
 * Outcomes only (Decision 7): no prices, no skill numbers, no subtypes, and
 * no hint of which prospect is an outlier.
 */

export interface ReplaceViewOptions {
  readonly team: Team;
  /** The spoof being replaced. */
  readonly spoofId: string;
  /** The team's prospects, or null when they can't be read. */
  readonly roster: Roster | null;
  /** A match is in progress: you can scout, but not swap. */
  readonly locked: boolean;
  /** Swaps the prospect in and saves; says how it went. */
  readonly onSwap: (prospectId: string) => SwapResult;
}

export interface ReplaceView {
  readonly element: HTMLElement;
  readonly heading: HTMLElement;
  /** Moves the warm-ups and any drill on. */
  tick(seconds: number, steps: number): void;
  dispose(): void;
}

/** A prospect's cell, in CSS px. */
const CELL_SIZE = 76;

const SWAP_PROBLEM_TEXT: Readonly<Record<SwapProblem, string>> = {
  'too-few': `You draft at ${String(PROSPECTS)} picks.`,
  'no-prospect': "That prospect isn't available any more.",
  'no-spoof': "That spoof isn't on your team any more.",
  'type-limit': 'A team holds at most 1 king or queen, and 2 of each other face.',
  'match-in-progress': 'A match is in progress: finish it first.',
  none: STORAGE_PROBLEM_TEXT.none,
  unavailable: STORAGE_PROBLEM_TEXT.unavailable,
  unreadable: STORAGE_PROBLEM_TEXT.unreadable,
  newer: STORAGE_PROBLEM_TEXT.newer,
  full: STORAGE_PROBLEM_TEXT.full,
  invalid: STORAGE_PROBLEM_TEXT.invalid,
};

let dialogs = 0;

export function createReplaceView(options: ReplaceViewOptions): ReplaceView {
  const { team, spoofId, roster, locked, onSwap } = options;
  const leaving = team.spoofs.find((s) => s.id === spoofId);
  if (!leaving) throw new Error(`No spoof ${spoofId} on the team`);
  const teamKit = kit(team.color, 'home');
  const prospects = roster?.prospects ?? [];
  const ready = roster !== null && canDraft(roster) && !locked;

  const element = el('section', 'replace-view');
  const back = el('a', 'card-back');
  back.href = cardHash(spoofId);
  back.append('‹ ', spoofLabel(leaving));
  const heading = el('h2', 'replace-title');
  heading.tabIndex = -1;
  heading.append('Replace ', spoofLabel(leaving));

  // --- The picks held, and what they let you do.
  const picks = el('p', 'pharm-picks-line replace-picks');
  const text = draftPicksText(prospects.length, PROSPECTS);
  const marks = el('span', 'pharm-picks-marks', text.marks);
  marks.setAttribute('aria-hidden', 'true');
  picks.append(
    el('span', 'pharm-picks-title', 'Draft picks'),
    marks,
    el('span', 'visually-hidden', `${text.label}.`),
    el('span', 'pharm-picks-note', ` · ${text.note}`),
  );
  const help = el('p', 'pharm-picks-help');
  if (roster === null) help.textContent = "Your prospects couldn't be read.";
  else if (locked) help.textContent = 'A match is in progress: finish it before replacing a spoof.';
  else if (prospects.length === 0) help.textContent = 'No prospects yet. Each loss brings one.';
  else if (!ready) {
    help.textContent = `Tap one to scout it. You draft at ${String(PROSPECTS)}, and each loss brings one.`;
  } else {
    help.textContent = `Pick one to swap in for ${leaving.name}. The other ${String(PROSPECTS - 1)} go.`;
  }

  // --- The prospects, each warming up in its cell.
  const seed = newSeed();
  const warmUps = new Map<string, WarmUp>(
    prospects.map((p, i) => [p.id, startWarmUp(p, warmUpSeed(seed, i))]),
  );
  let picked: string | null = null;
  const grid = el('ul', 'combine-grid replace-grid');
  grid.setAttribute('aria-label', 'Your prospects');
  const cells = prospects.map((prospect) => {
    const item = el('li', 'combine-item');
    const button = el('button', 'combine-cell');
    button.type = 'button';
    button.setAttribute('aria-pressed', 'false');
    const canvas = el('canvas', 'combine-canvas');
    canvas.setAttribute('aria-hidden', 'true');
    const ctx = sizeCanvas(canvas, CELL_SIZE);
    button.append(canvas, spoofLabel(prospect));
    button.addEventListener('click', () => {
      pick(prospect.id);
    });
    item.append(button);
    grid.append(item);
    return { id: prospect.id, button, ctx };
  });

  // --- Its drills, as in the combine: no price, no Draft.
  const drills = createDrillCourt({
    teamColor: team.color,
    backLabel: 'Back to the prospects',
    onBack: (id) => {
      drills.close();
      cells.find((c) => c.id === id)?.button.focus();
    },
  });

  // --- Swap in, or cancel.
  const actions = el('div', 'replace-actions');
  const swap = el('button', 'button button-primary', 'Swap in');
  swap.type = 'button';
  const cancel = el('a', 'button', 'Cancel');
  cancel.href = cardHash(spoofId);
  actions.append(swap, cancel);
  swap.hidden = !ready;
  const status = el('p', 'card-status');
  status.setAttribute('role', 'status');

  // --- The last check: it can't be undone.
  dialogs += 1;
  const dialog = el('dialog', 'confirm-dialog');
  const dialogTitle = el('h2', 'confirm-title');
  dialogTitle.id = `swap-title-${String(dialogs)}`;
  const dialogBody = el('p', 'confirm-body');
  dialogBody.id = `swap-body-${String(dialogs)}`;
  dialog.setAttribute('aria-labelledby', dialogTitle.id);
  dialog.setAttribute('aria-describedby', dialogBody.id);
  const keep = el('button', 'button', 'Keep');
  keep.type = 'button';
  const confirm = el('button', 'button button-primary', 'Swap in');
  confirm.type = 'button';
  const dialogActions = el('div', 'confirm-actions');
  dialogActions.append(keep, confirm);
  dialog.append(dialogTitle, dialogBody, dialogActions);
  keep.addEventListener('click', () => {
    dialog.close();
  });
  dialog.addEventListener('close', () => {
    if (dialog.returnValue !== 'swap') swap.focus();
  });

  function pick(id: string): void {
    picked = id;
    const prospect = prospects.find((p) => p.id === id);
    for (const cell of cells) {
      const on = cell.id === id;
      cell.button.classList.toggle('is-picked', on);
      cell.button.setAttribute('aria-pressed', String(on));
    }
    swap.textContent = prospect ? `Swap in ${prospect.name}` : 'Swap in';
    swap.setAttribute('aria-disabled', 'false');
    if (prospect) drills.open({ spoof: prospect }, prospects.indexOf(prospect));
  }

  swap.setAttribute('aria-disabled', 'true');
  swap.addEventListener('click', () => {
    const prospect = prospects.find((p) => p.id === picked);
    if (!prospect) {
      status.textContent = 'Tap a prospect to pick it first.';
      return;
    }
    dialogTitle.textContent = `Swap in ${prospect.name}?`;
    dialogBody.textContent = `${prospect.name} takes ${leaving.name}'s place on your team, and your other ${String(PROSPECTS - 1)} prospects go. This can't be undone.`;
    confirm.textContent = `Swap in ${prospect.name}`;
    keep.textContent = `Keep ${leaving.name}`;
    dialog.returnValue = '';
    dialog.showModal();
    keep.focus();
  });
  confirm.addEventListener('click', () => {
    const prospect = prospects.find((p) => p.id === picked);
    dialog.returnValue = 'swap';
    dialog.close();
    if (!prospect) return;
    const result = onSwap(prospect.id);
    if (!result.ok) {
      status.textContent = `${prospect.name} couldn't be swapped in. ${SWAP_PROBLEM_TEXT[result.problem]}`;
      swap.focus();
      return;
    }
    // On to the new spoof's card, where it can be renamed and given a mark.
    window.location.hash = cardHash(prospect.id);
  });

  element.append(back, heading, picks, help);
  if (prospects.length > 0) element.append(grid, drills.element);
  element.append(actions, status, dialog);

  function draw(id: string): void {
    const cell = cells.find((c) => c.id === id);
    const warmUp = warmUps.get(id);
    const prospect = prospects.find((p) => p.id === id);
    if (cell?.ctx && warmUp && prospect) {
      drawWarmUpCell(cell.ctx, CELL_SIZE, warmUp, prospect.mark, teamKit);
    }
  }
  for (const id of warmUps.keys()) draw(id);

  const resize = new ResizeObserver(() => {
    drills.resize();
  });
  resize.observe(drills.element);

  return {
    element,
    heading,
    tick(seconds, steps) {
      if (steps > 0) {
        for (const [id, warmUp] of warmUps) {
          let next = warmUp;
          for (let s = 0; s < steps; s += 1) next = stepWarmUp(next);
          warmUps.set(id, next);
          draw(id);
        }
      }
      drills.tick(seconds);
    },
    dispose() {
      drills.close();
      resize.disconnect();
      if (dialog.open) dialog.close();
    },
  };
}

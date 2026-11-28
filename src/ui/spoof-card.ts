import { kit } from '../design/kits';
import {
  changeMark,
  renameSpoof,
  spoofRenameProblem,
  type SpoofRenameProblem,
} from '../game/pharm';
import { markNames, type MarkName } from '../game/spoof-types';
import type { TeamStats } from '../game/stats';
import { MAX_SPOOF_NAME_LENGTH, type Team } from '../game/teams';
import { startWarmUp, stepWarmUp, warmUpSeed, type WarmUp } from '../game/warm-up';
import { STORAGE_PROBLEM_TEXT, type SaveResult } from '../storage/saved-team';
import { el, newSeed } from './dom';
import { createDrillCourt } from './drill-court';
import { MARK_LABELS, markDisc, spoofLabel } from './spoof-label';
import { spoofLineText } from './stats-text';
import { replaceHash } from './routes';
import { hashFor } from './tabs';
import { drawWarmUpCell, sizeCanvas } from './warm-up-cell';

/**
 * A spoof's card on the Pharm tab (#109, wireframe 2), at `#/pharm/<id>`:
 * the spoof warming up, its name and outcomes, and from here, scouting it
 * with the combine's drills, renaming it and changing its mark. Outcomes
 * only (Decision 7): no skills, comps, subtypes or prices.
 *
 * **Replace this spoof** opens its replace screen (#110).
 */

export interface SpoofCardOptions {
  readonly team: Team;
  readonly spoofId: string;
  /** The team's stats, or null when they can't be read. */
  readonly stats: TeamStats | null;
  /** While a match is in progress, the spoof can't be renamed or re-marked. */
  readonly locked: boolean;
  /** Saves the team with the change and puts it in play; says whether it was saved. */
  readonly onChange: (team: Team) => SaveResult;
}

export interface SpoofCard {
  readonly element: HTMLElement;
  readonly heading: HTMLElement;
  /** Moves the warm-up and any drill on: `seconds` of real time, `steps` warm-up frames. */
  tick(seconds: number, steps: number): void;
  /** Stops the drills: the card is leaving the screen. */
  dispose(): void;
}

/** The card's warm-up cell, in CSS px: larger than the roster's. */
const CELL_SIZE = 140;

const RENAME_PROBLEM_TEXT: Readonly<Record<SpoofRenameProblem, string>> = {
  empty: 'A spoof needs a name.',
  long: `A name can be up to ${String(MAX_SPOOF_NAME_LENGTH)} characters.`,
  taken: 'Another spoof on your team has that name.',
};

const LOCKED_TEXT = 'A match is in progress: finish it to rename this spoof or change its mark.';

export function createSpoofCard(options: SpoofCardOptions): SpoofCard {
  const { spoofId, stats, locked, onChange } = options;
  let team = options.team;
  const spoof = () => team.spoofs.find((s) => s.id === spoofId);
  const first = spoof();
  if (!first) throw new Error(`No spoof ${spoofId} on the team`);
  const teamKit = kit(team.color, 'home');

  const element = el('article', 'spoof-card');
  const back = el('a', 'card-back', '‹ Roster');
  back.href = hashFor('pharm');

  // --- The spoof: its cell, name and type.
  const top = el('div', 'card-top');
  const canvas = el('canvas', 'card-cell');
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = sizeCanvas(canvas, CELL_SIZE);
  let warmUp: WarmUp = startWarmUp(first, warmUpSeed(newSeed(), 0));
  const heading = el('h2', 'card-name');
  heading.tabIndex = -1;
  const who = el('div', 'card-who');
  // No type on show (the owner, QA review on #109): the mark is the only thing
  // that identifies a spoof, and you can change it. Screen readers still hear
  // it after the name, as everywhere a spoof is named.
  who.append(heading);
  top.append(canvas, who);

  // --- Its outcomes, as on the Stats tab.
  const line = spoofLineText(stats?.spoofs[spoofId]);
  const tiles = el('dl', 'stats-tiles card-tiles');
  for (const [label, value] of [
    ['Matches', line.matches],
    ['Scrums', line.scrums],
    ['Pts / scrum', line.pointsPerScrum],
    ['+/− / scrum', line.plusMinusPerScrum],
  ] as const) {
    const tile = el('div', 'stats-tile');
    tile.append(el('dt', 'stats-tile-label', label), el('dd', 'stats-tile-value', value));
    tiles.append(tile);
  }

  // --- Scouting: the combine's drill court, for this spoof.
  const scout = el('button', 'button button-primary card-scout', 'Scout: run drills');
  scout.type = 'button';
  scout.setAttribute('aria-expanded', 'false');
  const drills = createDrillCourt({
    teamColor: team.color,
    backLabel: 'Back to the card',
    onBack: () => {
      closeDrills();
    },
  });
  scout.setAttribute('aria-controls', 'drill-title');
  function openDrills(): void {
    const current = spoof();
    if (!current) return;
    scout.setAttribute('aria-expanded', 'true');
    scout.hidden = true;
    drills.open({ spoof: current }, 0);
    drills.heading.focus();
  }
  function closeDrills(): void {
    drills.close();
    scout.hidden = false;
    scout.setAttribute('aria-expanded', 'false');
    scout.focus();
  }
  scout.addEventListener('click', openDrills);

  // --- Renaming, and changing its mark: saved at once.
  const edit = el('section', 'card-edit');
  edit.setAttribute('aria-labelledby', 'card-edit-title');
  const editTitle = el('h3', 'stats-section-title', 'Name and mark');
  editTitle.id = 'card-edit-title';
  const nameLabel = el('label', 'field-label', 'Name');
  nameLabel.htmlFor = 'card-name-input';
  const input = el('input', 'field-input card-name-input');
  input.id = 'card-name-input';
  input.value = first.name;
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.maxLength = MAX_SPOOF_NAME_LENGTH * 4;
  input.disabled = locked;
  const nameError = el('p', 'field-error');
  nameError.id = 'card-name-error';
  nameError.hidden = true;
  input.setAttribute('aria-describedby', nameError.id);
  const picker = el('div', 'card-marks');
  picker.setAttribute('role', 'group');
  picker.setAttribute('aria-label', 'Mark');
  const markButtons = markNames.map((mark) => {
    const option = el('button', 'combine-mark-option');
    option.type = 'button';
    option.disabled = locked;
    option.title = MARK_LABELS[mark];
    option.setAttribute('aria-label', MARK_LABELS[mark]);
    option.append(markDisc(mark, teamKit, 32, 13));
    option.addEventListener('click', () => {
      choose(mark, option);
    });
    picker.append(option);
    return { mark, option };
  });
  const status = el('p', 'card-status');
  status.setAttribute('role', 'status');
  edit.append(editTitle, nameLabel, input, nameError, el('p', 'field-label', 'Mark'), picker);
  if (locked) edit.append(el('p', 'pharm-note', LOCKED_TEXT));
  edit.append(status);

  function show(): void {
    const current = spoof();
    if (!current) return;
    heading.replaceChildren(spoofLabel(current));
    for (const { mark, option } of markButtons) {
      option.setAttribute('aria-pressed', String(current.mark === mark));
    }
    // With the drills open below, they show the new name and mark too (#120 review).
    if (drills.current() !== null) drills.update({ spoof: current });
    draw();
  }

  function save(next: Team, done: string): boolean {
    if (next === team) return false;
    const saved = onChange(next);
    if (!saved.ok) {
      status.textContent = `That couldn't be saved. ${STORAGE_PROBLEM_TEXT[saved.problem]}`;
      return false;
    }
    team = next;
    status.textContent = done;
    show();
    return true;
  }

  function rename(): void {
    const problem = spoofRenameProblem(team, spoofId, input.value);
    if (problem) {
      nameError.textContent = RENAME_PROBLEM_TEXT[problem];
      nameError.hidden = false;
      input.setAttribute('aria-invalid', 'true');
      return;
    }
    nameError.hidden = true;
    input.removeAttribute('aria-invalid');
    // The name it already has: nothing to save, so nothing is rebuilt (#120 review).
    if (input.value.trim() === spoof()?.name) {
      input.value = input.value.trim();
      return;
    }
    const next = renameSpoof(team, spoofId, input.value);
    if (save(next, `Renamed ${input.value.trim()}.`)) input.value = input.value.trim();
  }
  // Enter fires `change` in a text field, as leaving it does.
  input.addEventListener('change', rename);

  function choose(mark: MarkName, option: HTMLButtonElement): void {
    save(changeMark(team, spoofId, mark), `Mark: ${MARK_LABELS[mark]}.`);
    option.focus();
  }

  function draw(): void {
    const current = spoof();
    if (ctx && current) drawWarmUpCell(ctx, CELL_SIZE, warmUp, current.mark, teamKit);
  }

  // Replacing it (#110): its own screen, with your prospects.
  const replace = el('a', 'button card-replace', 'Replace this spoof');
  replace.href = replaceHash(spoofId);
  const actions = el('div', 'card-actions');
  actions.append(scout, replace);

  element.append(back, top, tiles, actions, drills.element, edit);
  show();
  // The drill court follows the card's width, as in the combine.
  const resize = new ResizeObserver(() => {
    drills.resize();
  });
  resize.observe(drills.element);

  return {
    element,
    heading,
    tick(seconds, steps) {
      for (let s = 0; s < steps; s += 1) warmUp = stepWarmUp(warmUp);
      if (steps > 0) draw();
      drills.tick(seconds);
    },
    dispose() {
      drills.close();
      resize.disconnect();
    },
  };
}

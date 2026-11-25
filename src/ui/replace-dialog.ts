import type { Team } from '../game/teams';
import { el } from './dom';

/**
 * The last check before a new team replaces your saved one (the owner, #71
 * QA). Since #72 it opens when you finish the draft, the moment the new team
 * is saved. A modal `<dialog>`: the browser keeps focus inside it, and Escape
 * or "Keep" closes it with nothing changed. "Keep" has focus first, so a
 * stray Enter doesn't replace anything.
 */

let dialogs = 0;

export interface ReplaceDialog {
  readonly element: HTMLDialogElement;
  /** Asks; `onReplace` runs only if the player chooses to replace. */
  open(newName: string, onReplace: () => void): void;
}

export function replaceDialog(savedTeam: Team): ReplaceDialog {
  dialogs += 1;
  const element = el('dialog', 'confirm-dialog');
  const title = el('h2', 'confirm-title');
  title.id = `confirm-title-${String(dialogs)}`;
  const body = el('p', 'confirm-body');
  body.id = `confirm-body-${String(dialogs)}`;
  element.setAttribute('aria-labelledby', title.id);
  element.setAttribute('aria-describedby', body.id);
  const actions = el('div', 'confirm-actions');
  const keep = el('button', 'button');
  keep.type = 'button';
  const replace = el('button', 'button button-primary', 'Replace team');
  replace.type = 'button';
  actions.append(keep, replace);
  element.append(title, body, actions);

  let onReplace: (() => void) | null = null;
  keep.addEventListener('click', () => {
    element.close();
  });
  replace.addEventListener('click', () => {
    element.close();
    onReplace?.();
  });
  element.addEventListener('close', () => {
    onReplace = null;
  });

  return {
    element,
    open(newName, then) {
      onReplace = then;
      title.textContent = `Replace ${savedTeam.name}?`;
      body.textContent = `${newName} will take the place of your saved team, ${savedTeam.logo} ${savedTeam.name}, with its spoofs and its record. This can't be undone.`;
      keep.textContent = `Keep ${savedTeam.name}`;
      element.showModal();
      keep.focus();
    },
  };
}

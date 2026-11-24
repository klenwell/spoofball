import { teamColorNames, type TeamColorName } from '../design/tokens';
import type { Draft } from '../game/draft';
import { TEAM_LOGOS } from '../game/logos';
import { teamNameProblem, type NameProblem } from '../game/new-team';
import { createRandom } from '../game/random';
import { MAX_TEAM_NAME_LENGTH, characterCount, type Team } from '../game/teams';
import { STORAGE_PROBLEM_TEXT } from '../storage/saved-team';
import type { Panel } from './app-shell';
import { el, newSeed } from './dom';
import { START_HASH } from './routes';

/**
 * The create screen (#71, wireframe 1 in docs/design.md): a team name, one of
 * the 8 colors and an emoji logo, with a preview that follows your choices.
 * Since #72, **Next: the combine** takes them to the combine, where you draft
 * your 5 spoofs; the team is saved when the draft is finished. With a draft
 * in progress, the screen opens with its choices, so you can change them
 * and go back to the same pool. Where the browser won't save, the screen says
 * so, and you can still play.
 *
 * The color and logo grids are radio groups, so a keyboard moves through them
 * with the arrow keys and a screen reader announces each choice.
 */

/** What the create screen chooses: a draft's name, color and logo. */
export type TeamChoices = Pick<Draft, 'name' | 'color' | 'logo'>;

export interface NewTeamOptions {
  /** False where the browser's storage is missing or blocked. */
  readonly canSave: boolean;
  /** The team saved now, which a new team replaces when its draft is finished. */
  readonly savedTeam: Team | null;
  /** The draft in progress, whose choices the screen starts with, or null. */
  readonly draft: Draft | null;
  /** Goes on to the combine with these choices (spaces trimmed from the name). */
  readonly onNext: (choices: TeamChoices) => void;
}

const NAME_PROBLEM_TEXT: Readonly<Record<NameProblem, string>> = {
  empty: 'Your team needs a name.',
  long: `A name can be up to ${String(MAX_TEAM_NAME_LENGTH)} characters.`,
};

function colorLabel(name: TeamColorName): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

let fieldIds = 0;

/** A radio button inside its label, for the color and logo grids. */
function choice(
  group: string,
  value: string,
  label: string,
  swatch: HTMLElement,
  checked: boolean,
) {
  const wrap = el('label', `choice choice-${group}`);
  const input = el('input', 'choice-input');
  input.type = 'radio';
  input.name = group;
  input.value = value;
  input.checked = checked;
  input.setAttribute('aria-label', label);
  swatch.setAttribute('aria-hidden', 'true');
  wrap.append(input, swatch);
  return { wrap, input };
}

function pickAtRandom<T>(items: readonly T[]): T {
  const random = createRandom(newSeed());
  return random.pick(items);
}

export function createNewTeamScreen({ canSave, savedTeam, draft, onNext }: NewTeamOptions): Panel {
  fieldIds += 1;
  const id = (name: string) => `new-team-${name}-${String(fieldIds)}`;

  const element = el('section', 'new-team');
  const heading = el('h1', 'screen-title', 'Create your team');
  heading.tabIndex = -1;
  const form = el('form', 'new-team-form');
  form.noValidate = true;

  // --- Name ---------------------------------------------------------------
  const nameField = el('div', 'field');
  const nameLabel = el('label', 'field-label', 'Team name');
  nameLabel.htmlFor = id('name');
  const nameInput = el('input', 'field-input');
  nameInput.id = id('name');
  nameInput.name = 'name';
  nameInput.autocomplete = 'off';
  nameInput.spellcheck = false;
  nameInput.required = true;
  // A guard against pasting a page of text; the 16-character rule is checked
  // separately, since an emoji can take several of these.
  nameInput.maxLength = MAX_TEAM_NAME_LENGTH * 4;
  if (draft) nameInput.value = draft.name;
  const nameHint = el('p', 'field-hint');
  nameHint.id = id('name-hint');
  const nameCount = el('span', 'field-count');
  nameHint.append(`Up to ${String(MAX_TEAM_NAME_LENGTH)} characters. `, nameCount);
  const nameError = el('p', 'field-error');
  nameError.id = id('name-error');
  nameError.hidden = true;
  nameInput.setAttribute('aria-describedby', `${nameHint.id} ${nameError.id}`);
  nameField.append(nameLabel, nameInput, nameHint, nameError);

  // --- Color --------------------------------------------------------------
  const colorSet = el('fieldset', 'field choice-grid color-grid');
  colorSet.append(el('legend', 'field-label', 'Color'));
  const firstColor = draft?.color ?? pickAtRandom(teamColorNames);
  const colorInputs = teamColorNames.map((name) => {
    const dot = el('span', 'color-dot');
    dot.style.setProperty('--dot', `var(--team-${name})`);
    dot.style.setProperty('--dot-deep', `var(--team-${name}-deep)`);
    const { wrap, input } = choice('color', name, colorLabel(name), dot, name === firstColor);
    colorSet.append(wrap);
    return input;
  });

  // --- Logo ---------------------------------------------------------------
  const logoSet = el('fieldset', 'field choice-grid logo-grid');
  logoSet.append(el('legend', 'field-label', 'Logo'));
  const firstLogo = draft?.logo ?? pickAtRandom(TEAM_LOGOS);
  const logoInputs = TEAM_LOGOS.map((logo) => {
    const face = el('span', 'logo-face', logo);
    // The emoji's own name is what a screen reader says for it.
    const { wrap, input } = choice('logo', logo, logo, face, logo === firstLogo);
    logoSet.append(wrap);
    return input;
  });

  // --- Preview ------------------------------------------------------------
  const preview = el('div', 'field team-preview');
  const previewLabel = el('p', 'field-label', 'Preview');
  const previewCard = el('div', 'team-preview-card');
  const previewDisc = el('span', 'team-preview-disc');
  previewDisc.setAttribute('aria-hidden', 'true');
  const previewLogo = el('span', 'team-preview-logo');
  const previewName = el('span', 'team-preview-name');
  previewCard.append(previewDisc, previewLogo, previewName);
  preview.append(previewLabel, previewCard);

  // --- Notices and buttons -------------------------------------------------
  const storageNotice = el('p', 'notice');
  storageNotice.setAttribute('role', 'status');
  // Shown first, where it can't be missed (the owner, #71 QA), and again by
  // the buttons. Screen readers hear it with the form, since the form points to it.
  const replaces = el('p', 'notice notice-warning');
  replaces.id = id('replaces');
  const replacesAgain = el('p', 'field-hint field-warning');
  if (savedTeam) {
    const saved = el('strong', undefined, `${savedTeam.logo} ${savedTeam.name}`);
    replaces.append(
      'When you finish the draft, your new team replaces your saved team, ',
      saved,
      '.',
    );
    replacesAgain.textContent = `Finishing the draft replaces ${savedTeam.name}.`;
    form.setAttribute('aria-describedby', replaces.id);
  } else {
    replaces.hidden = true;
    replacesAgain.hidden = true;
  }
  const actions = el('div', 'form-actions');
  const back = el('a', 'button', 'Back');
  back.href = START_HASH;
  const submit = el('button', 'button button-primary', 'Next: the combine');
  submit.type = 'submit';
  actions.append(back, submit);

  form.append(nameField, colorSet, logoSet, preview, storageNotice, replacesAgain, actions);
  element.append(heading, replaces, form);

  storageNotice.textContent = canSave ? '' : STORAGE_PROBLEM_TEXT.unavailable;
  storageNotice.hidden = canSave;

  const checked = (inputs: readonly HTMLInputElement[]) => inputs.find((i) => i.checked)?.value;
  const color = () => (checked(colorInputs) ?? firstColor) as TeamColorName;
  const logo = () => checked(logoInputs) ?? firstLogo;

  function showNameProblem(problem: NameProblem | null): void {
    nameError.textContent = problem ? NAME_PROBLEM_TEXT[problem] : '';
    nameError.hidden = problem === null;
    if (problem) nameInput.setAttribute('aria-invalid', 'true');
    else nameInput.removeAttribute('aria-invalid');
  }

  function update(): void {
    const name = nameInput.value.trim();
    const count = characterCount(name);
    nameCount.textContent = `${String(count)} / ${String(MAX_TEAM_NAME_LENGTH)}`;
    nameCount.classList.toggle('is-over', count > MAX_TEAM_NAME_LENGTH);
    previewDisc.style.setProperty('--dot', `var(--team-${color()})`);
    previewDisc.style.setProperty('--dot-deep', `var(--team-${color()}-deep)`);
    previewLogo.textContent = logo();
    previewName.textContent = name || 'Your team';
    previewName.classList.toggle('is-placeholder', name === '');
  }

  form.addEventListener('input', update);
  form.addEventListener('change', update);
  nameInput.addEventListener('input', () => {
    // Once you've been told, the message clears as soon as the name is fine.
    if (!nameError.hidden) showNameProblem(teamNameProblem(nameInput.value));
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const problem = teamNameProblem(nameInput.value);
    showNameProblem(problem);
    if (problem) {
      nameInput.focus();
      return;
    }
    onNext({ name: nameInput.value.trim(), color: color(), logo: logo() });
  });

  update();
  return { element, heading };
}

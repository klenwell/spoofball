import { contrastRatio } from '../../design/color';
import { installDesignTokens } from '../../design/install';
import { kit } from '../../design/kits';
import {
  fontSize,
  palette,
  radius,
  space,
  teamColorNames,
  teamColors,
  type TeamColorName,
} from '../../design/tokens';
import { appInfo } from '../../app-info';
import './style-guide.css';

installDesignTokens();

// Small DOM helper: every value is set as text, never parsed as HTML.
function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { className?: string; text?: string; style?: Partial<CSSStyleDeclaration> } = {},
  children: Node[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.className) node.className = props.className;
  if (props.text !== undefined) node.textContent = props.text;
  if (props.style) Object.assign(node.style, props.style);
  node.append(...children);
  return node;
}

function section(title: string, note: string, body: Node[]): HTMLElement {
  return h('section', { className: 'sg-section' }, [
    h('h2', { text: title }),
    h('p', { className: 'sg-note', text: note }),
    ...body,
  ]);
}

function ratio(a: string, b: string): string {
  return `${contrastRatio(a, b).toFixed(1)}:1`;
}

function paletteSection(): HTMLElement {
  const items = Object.entries(palette).map(([name, value]) =>
    h('div', { className: 'sg-swatch' }, [
      h('div', { className: 'sg-chip', style: { background: value } }),
      h('code', { text: `--color-${name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()}` }),
      h('span', { className: 'sg-value', text: value }),
    ]),
  );
  return section(
    'Palette',
    'App colors. A near-black page, so the white court and the team colors carry the screen.',
    [h('div', { className: 'sg-grid' }, items)],
  );
}

function disc(color: TeamColorName, style: 'home' | 'away'): HTMLElement {
  const k = kit(color, style);
  return h(
    'div',
    {
      className: 'sg-disc',
      style: { background: k.fill, borderColor: k.trim },
    },
    [h('span', { className: 'sg-disc-mark', style: { background: k.mark } })],
  );
}

function teamColorsSection(): HTMLElement {
  const rows = teamColorNames.map((name) => {
    const { base, deep } = teamColors[name];
    return h('div', { className: 'sg-team' }, [
      h('div', { className: 'sg-team-name' }, [
        h('strong', { text: name }),
        h('code', { text: `--team-${name}` }),
      ]),
      h('div', { className: 'sg-kits' }, [
        h('figure', {}, [disc(name, 'home'), h('figcaption', { text: 'home' })]),
        h('figure', {}, [disc(name, 'away'), h('figcaption', { text: 'away' })]),
      ]),
      h('dl', { className: 'sg-team-values' }, [
        h('dt', { text: 'base' }),
        h('dd', { text: `${base} · ${ratio(base, palette.court)} on court` }),
        h('dt', { text: 'deep' }),
        h('dd', { text: `${deep} · ${ratio(deep, palette.white)} on white` }),
        h('dt', { text: 'seats' }),
        h('dd', { text: `${ratio(base, palette.surface)} on the dark seat rows` }),
      ]),
    ]);
  });
  return section(
    'Team colors and kits',
    'Home kit: a disc in the team color. Away kit: a white disc trimmed in the team color. When two teams share a color, the visitor wears away. The court is white, so every color (and so every away trim) is at least 3:1 against it, and every deep shade at least 4.5:1. A light shadow lifts discs off the court. The marks here are placeholders until the avatar step (#18).',
    [h('div', { className: 'sg-teams' }, rows)],
  );
}

function typeSection(): HTMLElement {
  const rows = Object.entries(fontSize)
    .reverse()
    .map(([name, size]) =>
      h('div', { className: 'sg-type-row' }, [
        h('code', { text: `--text-${name} · ${size}` }),
        h('span', { text: 'Spoofball 1,204', style: { fontSize: size } }),
      ]),
    );
  return section(
    'Type',
    'System fonts on a 1.25 scale from a 16 px base. Scores use the tabular numeric font.',
    [
      ...rows,
      h('div', { className: 'sg-type-row' }, [
        h('code', { text: '--font-numeric' }),
        h('span', { className: 'sg-numeric', text: '412 – 388' }),
      ]),
    ],
  );
}

function spaceAndRadiusSection(): HTMLElement {
  const spaces = Object.entries(space).map(([name, value]) =>
    h('div', { className: 'sg-space-row' }, [
      h('code', { text: `--space-${name} · ${value}` }),
      h('span', { className: 'sg-space-bar', style: { width: value } }),
    ]),
  );
  const radii = Object.entries(radius).map(([name, value]) =>
    h('div', { className: 'sg-swatch' }, [
      h('div', { className: 'sg-radius', style: { borderRadius: value } }),
      h('code', { text: `--radius-${name}` }),
      h('span', { className: 'sg-value', text: value }),
    ]),
  );
  return section('Spacing and radii', 'Spacing on a 4 px grid.', [
    ...spaces,
    h('div', { className: 'sg-grid sg-gap-top' }, radii),
  ]);
}

const root = document.querySelector<HTMLElement>('#style-guide');
if (!root) throw new Error('Missing #style-guide element');

root.replaceChildren(
  h('header', { className: 'sg-header' }, [
    h('h1', { text: 'Spoofball style guide' }),
    h('p', {
      className: 'sg-note',
      text: `The design tokens as the game uses them. ${appInfo().version}. Decisions are in docs/design.md.`,
    }),
  ]),
  paletteSection(),
  teamColorsSection(),
  typeSection(),
  spaceAndRadiusSection(),
);

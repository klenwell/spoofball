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
import { arenaSection } from './arena';
import { spoofsSection } from './spoofs';
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
    'App colors. A light, flat page: off-white behind, white bars and cards, dark text, and the team colors on a white court.',
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
        h('dd', { text: `${base} · ${ratio(base, palette.mosh)} on mosh` }),
        h('dt', { text: 'deep' }),
        h('dd', { text: `${deep} · ${ratio(deep, palette.white)} on white` }),
        h('dt', { text: 'seat' }),
        h('dd', { text: `${ratio(deep, palette.seat)} trim on a seat` }),
      ]),
    ]);
  });
  return section(
    'Team colors and kits',
    'Home kit: a disc in the team color. Away kit: a white disc trimmed in the team color. In a match your team (home) wears home and the visitor always wears away: solid discs are yours, white discs are theirs. Every disc trim is at least 3:1 against the white mosh, the gray apron, the white benches and the seats, and every deep shade at least 4.5:1 on white. The real marks are in the Spoofs section below.',
    [h('div', { className: 'sg-teams' }, rows)],
  );
}

function typeSection(): HTMLElement {
  const rows = Object.entries(fontSize)
    .reverse()
    .map(([name, size]) =>
      h('div', { className: 'sg-type-row' }, [
        h('code', { text: `--text-${name} · ${size}` }),
        h('span', { text: 'Spoofball 47', style: { fontSize: size } }),
      ]),
    );
  return section(
    'Type',
    'System fonts on a 1.25 scale from a 16 px base. Scores use the tabular numeric font.',
    [
      ...rows,
      h('div', { className: 'sg-type-row' }, [
        h('code', { text: '--font-numeric' }),
        h('span', { className: 'sg-numeric', text: '47 – 38' }),
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
  spoofsSection(section),
  arenaSection(section),
  typeSection(),
  spaceAndRadiusSection(),
);

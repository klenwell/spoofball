import { kit, scrumKits } from '../../design/kits';
import { teamColorNames, type TeamColorName } from '../../design/tokens';
import { spoofTypes } from '../../game/spoof-types';
import { createCanvas } from '../canvas';
import { drawSpoofDisc, type SpoofDisc } from '../spoof-disc';

const SIZES = [10, 16, 24] as const;
const CELL = 56;

function courtCanvas(
  width: number,
  height: number,
): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  const { canvas, ctx } = createCanvas(width, height);
  canvas.className = 'sg-court-canvas';
  return { canvas, ctx };
}

function label(text: string): HTMLElement {
  const span = document.createElement('span');
  span.className = 'sg-canvas-label';
  span.textContent = text;
  return span;
}

/** One card per type: home kit on the top row, away kit below, at each size. */
function typeCards(color: TeamColorName): HTMLElement[] {
  return spoofTypes.map((type) => {
    const card = document.createElement('figure');
    card.className = 'sg-spoof-card';
    const { canvas, ctx } = courtCanvas(CELL * SIZES.length, CELL * 2);
    (['home', 'away'] as const).forEach((style, row) => {
      SIZES.forEach((radius, col) => {
        drawSpoofDisc(ctx, {
          x: CELL * col + CELL / 2,
          y: CELL * row + CELL / 2,
          radius,
          type,
          kit: kit(color, style),
        });
      });
    });
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', `${type}: home and away kits at 10, 16 and 24 px`);
    const caption = document.createElement('figcaption');
    caption.textContent = type;
    card.append(canvas, caption);
    return card;
  });
}

function stateStrip(title: string, discs: (SpoofDisc & { caption: string })[]): HTMLElement {
  const figure = document.createElement('figure');
  figure.className = 'sg-state';
  const width = CELL * discs.length;
  const { canvas, ctx } = courtCanvas(width, CELL + 4);
  discs.forEach((disc, i) => {
    drawSpoofDisc(ctx, { ...disc, x: CELL * i + CELL / 2, y: CELL / 2 + 2 });
  });
  const captions = document.createElement('div');
  captions.className = 'sg-state-captions';
  captions.style.width = `${String(width)}px`;
  captions.append(...discs.map((d) => label(d.caption)));
  const heading = document.createElement('figcaption');
  heading.textContent = title;
  figure.append(heading, canvas, captions);
  return figure;
}

function states(color: TeamColorName): HTMLElement[] {
  const home = kit(color, 'home');
  const clash = scrumKits(color, color);
  return [
    stateStrip(
      'Fatigue: fades as it tires, never below 30%',
      [0, 25, 50, 75, 100].map((fatigue) => ({
        x: 0,
        y: 0,
        radius: 16,
        type: 'rook',
        kit: home,
        fatigue,
        caption: String(fatigue),
      })),
    ),
    stateStrip(
      'Growth: grows during a round, 10 to 24 px',
      [10, 13, 16, 20, 24].map((radius) => ({
        x: 0,
        y: 0,
        radius,
        type: 'king',
        kit: home,
        caption: `${String(radius)}px`,
      })),
    ),
    stateStrip('Highlight: selected', [
      { x: 0, y: 0, radius: 16, type: 'queen', kit: home, caption: 'off' },
      { x: 0, y: 0, radius: 16, type: 'queen', kit: home, highlighted: true, caption: 'on' },
      {
        x: 0,
        y: 0,
        radius: 16,
        type: 'queen',
        kit: kit(color, 'away'),
        highlighted: true,
        caption: 'away',
      },
    ]),
    stateStrip('Same color in a scrum: home vs visitor', [
      { x: 0, y: 0, radius: 16, type: 'knight', kit: clash.home, caption: 'home' },
      { x: 0, y: 0, radius: 16, type: 'bishop', kit: clash.home, caption: 'home' },
      { x: 0, y: 0, radius: 16, type: 'knight', kit: clash.visitor, caption: 'visitor' },
      { x: 0, y: 0, radius: 16, type: 'bishop', kit: clash.visitor, caption: 'visitor' },
    ]),
  ];
}

/** The Spoofs section: a color picker, every type in both kits, and the disc states. */
export function spoofsSection(
  section: (title: string, note: string, body: Node[]) => HTMLElement,
): HTMLElement {
  const picker = document.createElement('label');
  picker.className = 'sg-picker';
  picker.append('Team color ');
  const select = document.createElement('select');
  for (const name of teamColorNames) {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    select.append(option);
  }
  select.value = 'blue';
  picker.append(select);

  const types = document.createElement('div');
  types.className = 'sg-spoof-grid';
  const stateList = document.createElement('div');
  stateList.className = 'sg-states';

  const render = (): void => {
    const color = select.value as TeamColorName;
    types.replaceChildren(...typeCards(color));
    stateList.replaceChildren(...states(color));
  };
  select.addEventListener('change', render);
  render();

  return section(
    'Spoofs',
    'Every spoof type on the white court. Top row: home kit. Bottom row: away kit. Left to right: 10, 16 and 24 px radius, the smallest and largest a spoof can be. These are the draft marks, for review in #18.',
    [picker, types, h3('States'), stateList],
  );
}

function h3(text: string): HTMLElement {
  const heading = document.createElement('h3');
  heading.textContent = text;
  return heading;
}

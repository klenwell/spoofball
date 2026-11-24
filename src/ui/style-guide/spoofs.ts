import { kit, matchKits } from '../../design/kits';
import { palette, teamColorNames, type TeamColorName } from '../../design/tokens';
import { DEFAULT_MARKS, markNames, type MarkName } from '../../game/spoof-types';
import { createCanvas } from '../canvas';
import { drawSpoofDisc, type SpoofDisc } from '../spoof-disc';

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
  // Where a canvas must shrink to fit (max-width: 100%), its height follows,
  // so the discs stay round.
  canvas.style.height = 'auto';
  return { canvas, ctx };
}

function label(text: string): HTMLElement {
  const span = document.createElement('span');
  span.className = 'sg-canvas-label';
  span.textContent = text;
  return span;
}

/** The shown type whose default this mark is, if any. */
function defaultFor(mark: MarkName): string | null {
  const entry = Object.entries(DEFAULT_MARKS).find(([, m]) => m === mark);
  return entry ? entry[0] : null;
}

/**
 * Where each mark is checked (#74): radius 10, 16 and 24 on the white mosh,
 * then radius 10, the smallest, on the gray apron and the red crush.
 */
const MARK_CELLS = [
  { radius: 10, ground: palette.mosh },
  { radius: 16, ground: palette.mosh },
  { radius: 24, ground: palette.mosh },
  { radius: 10, ground: palette.apron },
  { radius: 10, ground: palette.crush },
] as const;

/** One card per mark: home kit on the top row, away kit below, on each ground. */
function markCards(color: TeamColorName): HTMLElement[] {
  return markNames.map((mark) => {
    const card = document.createElement('figure');
    card.className = 'sg-spoof-card';
    const { canvas, ctx } = courtCanvas(CELL * MARK_CELLS.length, CELL * 2);
    MARK_CELLS.forEach(({ ground }, col) => {
      ctx.fillStyle = ground;
      ctx.fillRect(CELL * col, 0, CELL, CELL * 2);
    });
    (['home', 'away'] as const).forEach((style, row) => {
      MARK_CELLS.forEach(({ radius }, col) => {
        drawSpoofDisc(ctx, {
          x: CELL * col + CELL / 2,
          y: CELL * row + CELL / 2,
          radius,
          mark,
          kit: kit(color, style),
        });
      });
    });
    canvas.setAttribute('role', 'img');
    canvas.setAttribute(
      'aria-label',
      `${mark}: home and away kits at radius 10, 16 and 24 on the mosh, and 10 on the apron and the crush`,
    );
    const caption = document.createElement('figcaption');
    const type = defaultFor(mark);
    caption.textContent = type ? `${mark} (${type === 'pawn' ? 'every pawn' : type})` : mark;
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
  const match = matchKits(color, color);
  return [
    stateStrip(
      'Fatigue: fades as it tires, never below 30%',
      [0, 25, 50, 75, 100].map((fatigue) => ({
        x: 0,
        y: 0,
        radius: 16,
        mark: 'mallet',
        kit: home,
        fatigue,
        caption: String(fatigue),
      })),
    ),
    stateStrip(
      'Base size: radius 10 to 24 (in a scrum a spoof can blow from 8 up to 40)',
      [10, 13, 16, 20, 24].map((radius) => ({
        x: 0,
        y: 0,
        radius,
        mark: 'crown',
        kit: home,
        caption: String(radius),
      })),
    ),
    stateStrip('Highlight: selected', [
      { x: 0, y: 0, radius: 16, mark: 'gem', kit: home, caption: 'off' },
      { x: 0, y: 0, radius: 16, mark: 'gem', kit: home, highlighted: true, caption: 'on' },
      {
        x: 0,
        y: 0,
        radius: 16,
        mark: 'gem',
        kit: kit(color, 'away'),
        highlighted: true,
        caption: 'away',
      },
    ]),
    stateStrip('In a match, the visitor always wears away (even in the same color)', [
      { x: 0, y: 0, radius: 16, mark: 'shield', kit: match.home, caption: 'home' },
      { x: 0, y: 0, radius: 16, mark: 'starburst', kit: match.home, caption: 'home' },
      { x: 0, y: 0, radius: 16, mark: 'shield', kit: match.visitor, caption: 'visitor' },
      { x: 0, y: 0, radius: 16, mark: 'starburst', kit: match.visitor, caption: 'visitor' },
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
    types.replaceChildren(...markCards(color));
    stateList.replaceChildren(...states(color));
  };
  select.addEventListener('change', render);
  render();

  return section(
    'Spoofs',
    "Every mark, 16 in all (#74). Top row: home kit. Bottom row: away kit. Left to right: radius 10, 16 and 24 court units on the white mosh (the smallest and largest a spoof can be), then radius 10 on the gray apron and the red crush, drawn here at 1 unit = 1 px. In the arena they scale with the court. The first six are the types' defaults; pawn subtypes (basic, noble, angry) are hidden, so every pawn starts with the dot. Any spoof on your team can wear any mark. Draft shapes, for the owner's review in #74.",
    [picker, types, h3('States'), stateList],
  );
}

function h3(text: string): HTMLElement {
  const heading = document.createElement('h3');
  heading.textContent = text;
  return heading;
}

import { scrumKits } from '../../design/kits';
import { palette, teamColorNames, type TeamColorName } from '../../design/tokens';
import { arenaBounds, benchSeats } from '../../game/arena';
import { zoneMultiplier, type Zone } from '../../game/court';
import { drawArena, drawSpoofInArena } from '../arena';
import { arenaHeightFor, fitArena } from '../arena-view';
import { createCanvas } from '../canvas';
import { SAMPLES } from './arena-samples';

const ZONES: { zone: Zone; name: string; color: string; note: string }[] = [
  {
    zone: 'apron',
    name: 'Apron',
    color: palette.apron,
    note: 'gray outer ring, where spoofs start',
  },
  { zone: 'mosh', name: 'Mosh', color: palette.mosh, note: 'the large white circle' },
  { zone: 'crush', name: 'Crush', color: palette.crush, note: 'the red center spot' },
];

function picker(labelText: string, value: TeamColorName): [HTMLLabelElement, HTMLSelectElement] {
  const label = document.createElement('label');
  label.className = 'sg-picker';
  label.append(`${labelText} `);
  const select = document.createElement('select');
  for (const name of teamColorNames) {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    select.append(option);
  }
  select.value = value;
  label.append(select);
  return [label, select];
}

function legend(): HTMLElement {
  const list = document.createElement('ul');
  list.className = 'sg-zones';
  for (const { zone, name, color, note } of ZONES) {
    const item = document.createElement('li');
    const swatch = document.createElement('span');
    swatch.className = 'sg-zone-swatch';
    swatch.style.background = color;
    const text = document.createElement('span');
    text.textContent = `${name} ×${String(zoneMultiplier[zone])}: ${note}`;
    item.append(swatch, text);
    list.append(item);
  }
  return list;
}

/** The Court section: the arena with sample spoofs, and pickers for both teams' colors. */
export function arenaSection(
  section: (title: string, note: string, body: Node[]) => HTMLElement,
): HTMLElement {
  const [homeLabel, homeSelect] = picker('Home (your bench, below)', 'blue');
  const [visitorLabel, visitorSelect] = picker('Visitor (above)', 'orange');
  const pickers = document.createElement('div');
  pickers.className = 'sg-pickers';
  pickers.append(homeLabel, visitorLabel);

  const stage = document.createElement('div');
  stage.className = 'sg-arena';
  const bounds = arenaBounds();

  const render = (): void => {
    const width = Math.min(stage.clientWidth || 360, 520);
    const height = arenaHeightFor(bounds, width);
    const { canvas, ctx } = createCanvas(width, height);
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'The arena with sample spoofs from both teams');
    const view = fitArena(bounds, width, height);
    drawArena(ctx, view);

    const kits = scrumKits(homeSelect.value as TeamColorName, visitorSelect.value as TeamColorName);
    for (const sample of SAMPLES) {
      const seat = typeof sample.at === 'number' ? benchSeats(sample.side)[sample.at] : sample.at;
      if (!seat) continue;
      drawSpoofInArena(ctx, view, {
        x: seat.x,
        y: seat.y,
        radius: sample.radius,
        type: sample.type,
        kit: sample.side === 'home' ? kits.home : kits.visitor,
      });
    }
    stage.replaceChildren(canvas);
  };

  homeSelect.addEventListener('change', render);
  visitorSelect.addEventListener('change', render);
  // Redraw when the available width changes. Replacing the canvas changes the
  // stage's height, so watching height too would redraw in a loop.
  let lastWidth = -1;
  new ResizeObserver(() => {
    if (stage.clientWidth === lastWidth) return;
    lastWidth = stage.clientWidth;
    render();
  }).observe(stage);

  return section(
    'Arena',
    'The court and both benches, with sample spoofs mid-scrum. The apron scores nothing, the mosh ×1 and the crush ×3. The blue diagonals are decorative. Pick the same color for both teams to see the visitor switch to the away kit. Draft for review in #19.',
    [pickers, legend(), stage],
  );
}

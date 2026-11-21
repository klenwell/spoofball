import { matchKits } from '../design/kits';
import { arenaBounds, benchSeats } from '../game/arena';
import { PRESET_HOME, PRESET_VISITOR } from '../game/preset-teams';
import type { Lineup } from '../game/teams';
import type { Kit } from '../design/kits';
import { drawArena, drawSpoofInArena } from './arena';
import { arenaHeightFor, fitArena, type ArenaView } from './arena-view';
import { createCanvas } from './canvas';

/**
 * The Match screen's static court (#22): the two preset teams at the moment a
 * scrum starts, drawn in the final style. Nothing moves yet; the Match epic
 * adds the simulation.
 */

/** The arena never grows wider than this, so it stays a comfortable size on desktop. */
const MAX_ARENA_WIDTH = 480;

function drawLineup(ctx: CanvasRenderingContext2D, view: ArenaView, lineup: Lineup, kit: Kit) {
  const seats = benchSeats(lineup.side);
  for (const spoof of lineup.team.spoofs) {
    const spot = lineup.spots[spoof.id];
    if (!spot) continue;
    const at = 'seat' in spot ? seats[spot.seat] : spot;
    if (!at) continue;
    drawSpoofInArena(ctx, view, {
      x: at.x,
      y: at.y,
      radius: spoof.radius,
      type: spoof.type,
      kit,
    });
  }
}

function legendItem(name: string, note: string, kit: Kit): HTMLElement {
  const item = document.createElement('li');
  const swatch = document.createElement('span');
  swatch.className = 'match-swatch';
  swatch.style.background = kit.fill;
  swatch.style.borderColor = kit.trim;
  swatch.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span');
  label.textContent = `${name} · ${note}`;
  item.append(swatch, label);
  return item;
}

/** Builds the preview once. It redraws itself when its width changes. */
export function createMatchPreview(): HTMLElement {
  const kits = matchKits(PRESET_HOME.team.color, PRESET_VISITOR.team.color);

  const root = document.createElement('div');
  root.className = 'match-preview';

  const legend = document.createElement('ul');
  legend.className = 'match-legend';
  legend.append(
    legendItem(PRESET_HOME.team.name, 'you, home kit, bench below', kits.home),
    legendItem(PRESET_VISITOR.team.name, 'visitor, away kit, bench above', kits.visitor),
  );

  const stage = document.createElement('div');
  stage.className = 'match-stage';
  root.append(legend, stage);

  const bounds = arenaBounds();
  const render = (): void => {
    const width = Math.min(stage.clientWidth, MAX_ARENA_WIDTH);
    if (width <= 0) return;
    const height = arenaHeightFor(bounds, width);
    const { canvas, ctx } = createCanvas(width, height);
    canvas.setAttribute('role', 'img');
    canvas.setAttribute(
      'aria-label',
      `The court as a scrum starts: ${PRESET_HOME.team.name} (you) and ${PRESET_VISITOR.team.name} each have 3 spoofs on the court and 2 on their bench.`,
    );
    const view = fitArena(bounds, width, height);
    drawArena(ctx, view);
    drawLineup(ctx, view, PRESET_VISITOR, kits.visitor);
    drawLineup(ctx, view, PRESET_HOME, kits.home);
    stage.replaceChildren(canvas);
  };

  // Redraw only when the width changes. Replacing the canvas changes the
  // stage's height, so watching height too would redraw in a loop.
  let lastWidth = -1;
  new ResizeObserver(() => {
    if (stage.clientWidth === lastWidth) return;
    lastWidth = stage.clientWidth;
    render();
  }).observe(stage);

  return root;
}

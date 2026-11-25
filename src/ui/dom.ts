/** Small DOM helpers for the screens. Every value is set as text, never parsed as HTML. */

/** An element with an optional class and text. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** A team's emoji logo beside its name. Hidden from screen readers, which hear the name. */
export function teamLogo(logo: string): HTMLElement {
  const span = el('span', 'team-logo', logo);
  span.setAttribute('aria-hidden', 'true');
  return span;
}

/** Today in the player's time zone, as `YYYY-MM-DD`: the day a team joins, or a match is played (#89). */
export function today(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${String(now.getFullYear())}-${month}-${day}`;
}

/** A fresh seed for a match or a new team, from the browser's random source. */
export function newSeed(): number {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] ?? 1;
}

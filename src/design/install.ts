import { cssVariablesRule } from './tokens';

/** Adds the design tokens to the page as CSS custom properties on :root. */
export function installDesignTokens(doc: Document = document): void {
  const id = 'design-tokens';
  if (doc.getElementById(id)) return;
  const style = doc.createElement('style');
  style.id = id;
  style.textContent = cssVariablesRule();
  doc.head.prepend(style);
}

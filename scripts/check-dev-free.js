// Fails the build if the dev-only QA console (#117) reached the production
// build. Runs after `npm run build` (the `postbuild` script), in CI too.
//
// Usage: node scripts/check-dev-free.js [dist]

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Strings only the QA console contains. */
const MARKERS = ['QA console', 'simLoss', 'spoofball-qa-note'];

const root = process.argv[2] ?? 'dist';
const found = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(js|html|css|map)$/.test(name)) {
      const text = readFileSync(path, 'utf8');
      for (const marker of MARKERS) if (text.includes(marker)) found.push(`${path}: ${marker}`);
    }
  }
};
walk(root);
if (found.length > 0) {
  console.error(`The dev-only QA console reached the production build:\n${found.join('\n')}`);
  process.exit(1);
}
console.log(`${root}: no dev-only QA code.`);

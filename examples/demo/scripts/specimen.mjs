import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';
import { renderBlocksHtml, BLOCK_CSS, INFO_MENU_VARS, factsVars } from '@open-slot-ui/core';

// The example's own declarations, read from the TypeScript source — the specimen
// must show the SAME facts and art the game does, not a copy that can drift.
const jiti = createJiti(import.meta.url);
const { FACTS, buildRules } = await jiti.import('../src/content.ts');

/**
 * A SPECIMEN of the rules block vocabulary: this example's `rules.xml`, parsed and
 * rendered on its own page, on the light card the library ships defaults for.
 *
 * It exists to look at the blocks WITHOUT a game around them — the fastest way to
 * judge spacing, weights and colour while changing `BLOCK_CSS`, and a reference for
 * anyone writing a skin. Output is gitignored; regenerate with:
 *
 *   pnpm --dir examples/demo specimen && open examples/demo/screenshots/specimen.html
 */
const xml = readFileSync(fileURLToPath(new URL('../src/rules.xml', import.meta.url)), 'utf8');
const blocks = buildRules(xml); // the example's own parse + art resolution

const vars = factsVars(FACTS);
const tr = (s) => s.replace(/\{\{([\w.-]+)\}\}/g, (m, k) => String(vars[k] ?? m));
const body = renderBlocksHtml(blocks, tr, FACTS);
const palette = Object.entries(INFO_MENU_VARS).map(([k, v]) => `${k}:${v}`).join(';');

const OUT = fileURLToPath(new URL('../screenshots/', import.meta.url));
mkdirSync(OUT, { recursive: true });
writeFileSync(
  `${OUT}specimen.html`,
  `<!doctype html><meta charset="utf-8"><title>open-slot-ui — rules block specimen</title>
<style>
  body { margin: 0; background: #3a3f4a; font-family: system-ui, sans-serif; }
  .page { ${palette}; padding: 40px 0; }
  .ohm-card { width: min(92%, 900px); margin: 0 auto; background: var(--surface); color: var(--text); border-radius: 10px; overflow: hidden; }
  .ohm-body { padding: 30px 32px; }
  ${BLOCK_CSS}
</style>
<div class="page"><div class="ohm-card"><div class="ohm-body">${body}</div></div></div>`,
);
console.log(`specimen → ${OUT}specimen.html (${blocks.length} top-level blocks)`);

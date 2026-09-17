import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * WHAT THE SUITES ACTUALLY ASSERT, read from the suites themselves at build time.
 *
 * A "testing" page that lists cases by hand is a page that lies within a week. This
 * one reads the spec files in the example's `tests` directory and the unit files in
 * each package's, and pulls the titles out of them — so the docs can only describe
 * tests that exist.
 */
export interface SuiteCase { title: string; describe?: string }
export interface Suite { file: string; kind: 'e2e' | 'unit'; purpose: string; cases: SuiteCase[] }

/**
 * The repository root, found by walking up to the workspace file.
 *
 * Counting `../` would be wrong in one of the two modes this runs in: in dev the
 * module is read from `src/stories/`, in a build it is a bundled chunk several
 * directories deeper. Looking for a landmark is right in both.
 */
const root = ((): string => {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    dir = dirname(dir);
  }
  return dir;
})();
const read = (rel: string): string => readFileSync(join(root, rel), 'utf8');
const list = (rel: string, suffix: string): string[] => {
  try {
    return readdirSync(join(root, rel)).filter((f) => f.endsWith(suffix)).sort();
  } catch {
    return [];
  }
};

/** Why each suite exists — the one thing a title list cannot say for itself. */
const PURPOSE: Record<string, string> = {
  'hud.spec.ts': 'The HUD itself, read through the introspection API rather than through pixels.',
  'states.spec.ts': 'Every declarative state a round can put the bar in, driven through a postMessage harness.',
  'buyfeature.spec.ts': 'The buy sheet: prices, the confirm step, and what a bet modifier does to the bar.',
  'currency-dom.spec.ts': 'Money that does not fit — a zero-decimal currency in the billions, and crypto with five decimals.',
  'rules-blocks.spec.ts': 'The rules document: every module renders, nothing hides behind a click, and the tokens resolve.',
  'locale.spec.ts': 'The same HUD in sixteen languages, including the ones that run long.',
  'theme.spec.ts': 'Theming by tokens, and what a broken token does (nothing).',
  'layout-fit.spec.ts': 'The bar fits its window — plate, overhangs and all — at every size.',
  'matrix.spec.ts': 'Device screenshots: the HUD, the menu and the buy sheet on seven viewports.',
};

const strip = (s: string): string => s.replace(/\\'/g, "'").replace(/\\"/g, '"');

function casesOf(src: string): SuiteCase[] {
  const out: SuiteCase[] = [];
  let current: string | undefined;
  // Titles are the first string argument of a describe()/test()/it() that STARTS a
  // line — anchoring there keeps the word `test` inside someone's prose out of the
  // count. Nothing here runs the file.
  const re = /^[ \t]*(test\.describe|describe|test|it)\s*(?:\.\w+)?\s*\(\s*(['"`])([\s\S]*?)\2/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const [, kind, , title] = m;
    if (!title) continue;
    if (kind === 'test' || kind === 'it') out.push({ title: strip(title), ...(current ? { describe: current } : {}) });
    else current = strip(title);
  }
  return out;
}

export function suites(): Suite[] {
  const e2e = list('examples/demo/tests/', '.spec.ts').map((file) => ({
    file,
    kind: 'e2e' as const,
    purpose: PURPOSE[file] ?? '',
    cases: casesOf(read(`examples/demo/tests/${file}`)),
  }));
  const unit = ['core', 'dom'].flatMap((pkg) =>
    list(`packages/${pkg}/tests/`, '.test.ts').map((file) => ({
      file: `${pkg}/${file}`,
      kind: 'unit' as const,
      purpose: '',
      cases: casesOf(read(`packages/${pkg}/tests/${file}`)),
    })),
  );
  return [...e2e, ...unit];
}

/** The devices the e2e matrix runs on, read from the Playwright config. */
export function devices(): string[] {
  const src = read('examples/demo/playwright.config.ts');
  return [...src.matchAll(/name:\s*'([^']+)'/g)].map((m) => m[1] as string);
}

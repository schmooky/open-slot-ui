import { cp, rm, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/**
 * Copy the example's SKIN into the docs site's `public/`.
 *
 * The gallery mounts the real HUD, and the HUD is nothing without the stylesheet
 * that dresses it — so the docs have to serve the same one the client does. It is
 * copied rather than committed twice: one file on disk, one source of truth, and a
 * skin change can never leave the docs showing a stale look.
 */
const from = fileURLToPath(new URL('../../../examples/demo/public/skin/', import.meta.url));
const to = fileURLToPath(new URL('../public/skin/', import.meta.url));
await rm(to, { recursive: true, force: true });
await mkdir(to, { recursive: true });
await cp(from, to, { recursive: true });
console.log(`skin → ${to}`);

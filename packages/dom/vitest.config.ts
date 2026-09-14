import { defineConfig } from 'vitest/config';

// The DOM binding is tested against a real document (jsdom): mount the tree, drive
// the controls, assert what the markup says. No stylesheet is involved — these test
// the WIRING, which is the part open-ui owns.
export default defineConfig({
  test: { environment: 'jsdom', include: ['tests/**/*.test.ts'] },
  resolve: { alias: { '@open-slot-ui/core': new URL('../core/src/index.ts', import.meta.url).pathname } },
});

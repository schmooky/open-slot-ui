import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';

// The docs are static pages plus ONE client bundle: the gallery's story runtime,
// which mounts the real HUD from source. Everything a reader sees of the UI is the
// UI itself, live — never a screenshot of something that may since have changed.
const root = new URL('../../', import.meta.url);
const fromRoot = (p) => new URL(p, root).pathname;
export default defineConfig({
  site: 'https://open-ui.schmooky.dev',
  prefetch: { defaultStrategy: 'hover', prefetchAll: false },
  server: { port: 5210 },
  // Astro's dev toolbar floats at the bottom centre of the window — exactly where a
  // slot HUD lives. It sat on top of every story and turned up in every screenshot,
  // so it is off: this site's whole job is to show one UI and no other.
  devToolbar: { enabled: false },
  integrations: [mdx()],
  vite: {
    plugins: [tailwindcss()],
    // The workspace packages, read straight from TS source (the example client does
    // the same in its vite.config.ts — keep the two in step).
    resolve: {
      alias: [
        { find: /^@open-slot-ui\/core$/, replacement: fromRoot('packages/core/src/index.ts') },
        { find: /^@open-slot-ui\/dom$/, replacement: fromRoot('packages/dom/src/index.ts') },
      ],
    },
    server: { fs: { allow: [root.pathname] } },
  },
});

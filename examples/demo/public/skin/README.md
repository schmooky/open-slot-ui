# The demo's skin

`ui.min.css` and `ui/` (the icon font and its images) are the **game studio's own UI
stylesheet** — the design the DOM renderer is bound to. They are committed here so the
example builds and deploys from a clean checkout.

They are **not** part of `@open-slot-ui/dom`, which ships no stylesheet: the package
provides the markup contract (ids, `icon-*` classes, `data-state`) and the wiring, and
the look is supplied by the host:

```ts
mountDomHud(spec, { skin: { href: '/your-ui.css', font: { family: 'icomoon', src: '/icons.woff2' } } });
```

The demo reads the URL from `VITE_SKIN_URL` / `VITE_SKIN_FONT_URL` at build time, or
`?skin=` / `?font=` at runtime, so a deployment can point anywhere.

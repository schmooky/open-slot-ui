# Deploying the example

The example client is a **static build** — no server, no runtime env needed. Any static
host will serve it; these are the settings for [Timeweb Cloud App
Platform](https://timeweb.cloud/docs/apps/deploying-frontend-apps), which builds from a
connected Git repository and redeploys on every push to the branch you point it at.

## Timeweb App Platform

Create an app → **Frontend** → connect this repository, then:

| Field | Value |
| --- | --- |
| Framework | `Vite` (or "Other" — the build command is what matters) |
| Node.js | `22` |
| Project directory | *(leave empty — the repo root)* |
| Build command | `corepack enable && pnpm install --frozen-lockfile && pnpm build:demo` |
| Output directory | `examples/demo/dist` |

That's it. It builds the **whole workspace from source** (the demo's Vite config aliases
`@open-slot-ui/*` straight at `packages/*/src`), so no package needs publishing first,
and nothing has to be built in a separate step.

Pushes to the connected branch redeploy automatically.

### Pages

| Path | What it is |
| --- | --- |
| `/` | the **DOM renderer** — real markup, dressed by the skin |
| `/canvas.html` | the **canvas renderer** — the same core, drawn in Pixi |

### Optional environment variables

| Variable | Effect |
| --- | --- |
| `VITE_SKIN_URL` | Serve the stylesheet from somewhere else (a CDN, another origin) instead of the bundled `/skin/ui.min.css`. |
| `VITE_SKIN_FONT_URL` | Same for the icon font. Cross-origin fonts need `Access-Control-Allow-Origin` on the serving host. |

Both are also runtime query parameters — `/?skin=…&font=…` — so a deployed build can be
pointed at a different look without rebuilding.

## Anywhere else

```bash
pnpm install
pnpm build:demo          # → examples/demo/dist
npx serve examples/demo/dist
```

The output is plain files: `index.html`, `canvas.html`, `assets/`, `skin/`. Netlify,
Vercel, Cloudflare Pages, S3, nginx — all the same two answers: build command
`pnpm build:demo`, publish directory `examples/demo/dist`.

## What ends up public

The bundle includes `examples/demo/public/skin/` — the game studio's UI stylesheet and
icon font (see the README there). `@open-slot-ui/dom` itself ships no stylesheet; a
deployment that should not serve that skin sets `VITE_SKIN_URL` at build time.

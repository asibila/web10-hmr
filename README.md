# Web10

Unified, deduplicated catalog of the internet's supply and demand — a faceted
search surface over classifieds, jobs, stock media, rentals, services, events
and more.

This repository is an npm workspace with two runnable apps and one shared
package.

## Layout

```
.
├── apps/
│   ├── api/                 # NestJS classification API (Node)  — @web10/api
│   └── web/                 # React + Vite dashboard             — @web10/web
├── packages/
│   └── shared/              # Catalogue contract                 — @web10/shared
├── chrome-extension/        # Unpacked extension that captures pages
└── package.json             # Workspaces root
```

`apps/api` is its own git repository with its original history. `web10-api/` no
longer exists — it was moved here unchanged apart from the edits listed below.

### One install, one `node_modules`

This is an npm workspace, so there is a single root `node_modules` (108 MB) and a
single `package-lock.json`, shared by all three packages. `npm ls` reports one
copy of `vite@8.3.8` and one of `react@19.3.1` — dependencies are hoisted and
deduped, not duplicated per app.

Neither `apps/*` nor `packages/*` gets its own `node_modules`. Vite would create
one for its dependency-optimizer cache, so `cacheDir` is pinned to
`<root>/node_modules/.vite/web` in `apps/web/vite.config.ts`. If you add a
tool that insists on a local `node_modules`, pin its cache the same way rather
than accepting a second install tree.

Because of the hoisting, a version conflict between two workspaces is the only
thing that produces a nested `node_modules`. Treat one appearing as a signal that
two packages disagree on a dependency version.

### How the two halves meet

One server, one port, in both modes. The API is the host; React is mounted into it.

| | Development (`npm run dev`) | Production (`npm start`) |
|---|---|---|
| Process | one (`ts-node src/main.ts --dev`) | one (`node dist/main.js`) |
| React | Vite middleware mode, compiled on demand | `vite build` output in `apps/web/dist` |
| HTML | rendered per request via `entry-server.tsx` | rendered per request via the SSR bundle |
| Hydration | client attaches to the server markup | same |
| HMR | yes, websocket on the same port | n/a |
| URL | `http://127.0.0.1:3000` | `http://127.0.0.1:3000` |

`src/main.ts` registers a middleware that hands `/api/**` to the Nest router and
everything else to the React renderer. In development Vite serves the assets and
compiles the modules; in production `express.static` serves `apps/web/dist`.
Either way, HTML comes from `apps/web/src/entry-server.tsx`, rendered per
request. Because both halves live on one origin there is no proxy and no CORS
handling between them.

The `/api` prefix is the only boundary. Any new backend route is reachable from
the UI with a plain relative `fetch('/api/...')`.

#### Why Vite runs inside Nest, not the other way round

Vite is loaded with a dynamic `import()`. Nest 12 ships as ESM while this
package compiles to CommonJS, and Node 20.19+/22.12+ lets `require()` load ESM,
so `await import('vite')` works from the CJS build without a second process or a
bundler just for the server entry. The alternative — Vite hosting Nest — would
put the API lifecycle (shutdown hooks, config) under the dev tool.

Vite's `root` is pinned to `apps/web` in `vite.config.ts`, because Vite otherwise
defaults it to `process.cwd()`, which is the API folder.

There is deliberately no standalone `vite` script: running Vite alone would give
you a UI with no API. Use `npm run dev`.

### Server-side rendering

Every HTML response is rendered on the server; the browser hydrates it. Three
files carry this:

| File | Role |
|---|---|
| `apps/web/src/entry-server.tsx` | `render(data): string` — `renderToString` |
| `apps/web/src/main.tsx` | hydrates when markup exists, mounts when it does not |
| `apps/api/src/ssr.ts` | resolves data, injects markup + payload into the template |

`index.html` holds a `<!--app-html-->` marker inside `#root`. The middleware
replaces it with the rendered markup and appends
`window.__WEB10_DATA__ = {...}` before `</body>`, so the first paint already has
the data and hydration starts from an identical state.

Data loading is a self-request to the API (`/api/health` today), which keeps the
boundary honest: the server calls the same endpoint the browser would. Extend
`AppData` in `app-data.ts` and `ssr.ts` together when a page needs more, and
give `render` a `url` parameter for route-dependent pages — the middleware
already passes the request path.

Two escape hatches, both verified:

- No SSR bundle present → the API logs it and serves the client-only build, so
  `npm start` never fails to boot because a build step was skipped.
- Vite runs with `appType: 'custom'`, so it never answers navigation requests;
  the SSR middleware does, and missing assets still return a real 404.

Not implemented, and worth knowing before you need them: streaming
(`renderToPipeableStream`), per-request caching, and `renderToStaticMarkup` for
pages that ship no JavaScript. The `render` signature is the seam for all three.

### The shared contract

`packages/shared/src/index.ts` holds the taxonomy (`CATEGORIES`, `OFFER_TYPES`,
`STATES`) and the request/response types (`ClassifyPageInput`,
`EntityClassification`, `ClassificationResult`, `HealthStatus`).

- The API imports the compiled package (`@web10/shared` → `dist`).
- The web app resolves the **TypeScript source** directly, so edits are picked
  up without rebuilding.

Change the contract there, not in either app. `ClassifyPageDto` declares
`implements ClassifyPageInput`, so the class-validator DTO cannot drift from the
shared type without a compile error.

## Commands

Run everything from the repository root.

```sh
npm install          # installs all workspaces and builds @web10/shared
npm run dev          # one server on :3000 — Nest API + React with HMR
npm run build        # shared, API, client bundle and SSR bundle
npm start            # same server, serving the prebuilt React app
npm run typecheck    # typecheck every workspace
```

`npm run dev` is a single process. The API and the dashboard are both served
from `http://127.0.0.1:3000`; there is no second dev port.

Individual packages:

```sh
npm run start:dev -w @web10/api   # same as npm run dev, one level down
npm run build     -w @web10/shared
npm run build     -w @web10/web
```

## Configuration

The API reads `.env` from `apps/api/.env`. Copy `apps/api/.env.example` and set
at least `OPENCODE_PASSWORD`. See `apps/api/README.md` for the full table.

The web app needs no configuration: it always calls `/api` on its own origin.## Node version

Node 20.19+ (or 22.12+). The `engines` field in the root `package.json` records
this; Vite 8 and React 19 both require it.

## Git note

The root is not a git repository, but `apps/api` is. If you want a single
repository for the whole workspace, remove or relocate `apps/api/.git` first —
otherwise root-level tooling will treat that folder as a foreign repository.

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
When an SSR bundle is present, HTML comes from `apps/web/src/entry-server.tsx`,
rendered per request. Because both halves live on one origin there is no proxy
and no CORS handling between them.

In production the build folder decides what runs — see
[Serving modes](#serving-modes) for all four outcomes and their log lines.

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

When an SSR bundle is present, every HTML response is rendered on the server and
the browser hydrates it. Three files carry this:

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

#### Serving modes

The API picks one mode at boot and never re-checks the disk afterwards. In
`apps/api/src/main.ts`, `bootstrap()` calls `inspectWebBuild` (`ssr.ts`) once and
switches on the result: a three-way `switch` for production, plus the `--dev`
branch chosen from `process.argv`.

| Mode | Chosen when | HTML | Log line |
|---|---|---|---|
| `dev` | `npm run dev` (passes `--dev`) | `entry-server.tsx` compiled per request, HMR live | `Vite + SSR attached; HMR shares port 3000` |
| `ssr` | `dist/index.html` **and** `dist/server/entry-server.js` exist | rendered per request from the prebuilt bundle | `Server-rendering with ...\entry-server.js` |
| `client` | `dist/index.html` exists, no SSR bundle | static shell; React renders in the browser | `Serving the web build from ... (client-only)` |
| `api-only` | no `dist/index.html` | none — every non-`/api` URL returns 404 | `No web build at ...; running API only.` |

`client` and `api-only` are deliberate fallbacks, not failures. They exist so
`npm start` boots even when a build step was skipped, and because client-only
deployment is a legitimate topology: `readAppData()` returns `EMPTY_APP_DATA`
when the HTML carries no `window.__WEB10_DATA__`, and the app fetches on mount.
What you lose is the server-rendered first paint — the page arrives as an empty
shell and fills in after hydration.

##### Why the SSR bundle can be missing

1. **`emptyOutDir` wipes it.** `apps/web/vite.config.ts` sets
   `emptyOutDir: true`, so a plain `vite build` — including
   `npx vite build` inside `apps/web` — empties the *whole* `dist/`, deleting
   the `dist/server/` folder the SSR step wrote. You end up in `client` mode
   with no warning beyond the log line. **Never run bare `vite build`;** use
   `npm run build` (root) or `npm run build -w @web10/web`.
2. **The build stopped after the client bundle.** `build` is
   `tsc && vite build && vite build --ssr ...`, so a failure or Ctrl-C during
   the third step leaves `dist/` with a client bundle only.
3. **Stale artifacts.** `dist/` is gitignored and never shared, so a `dist/`
   from before this feature existed has no `server/` folder.
4. **Partial deployment.** A Docker copy or CDN sync that ships `dist/` but
   excludes `dist/server/`.
5. **Path mismatch.** The check is fixed to
   `<webDist>/server/entry-server.js`; a different `--ssr` entry name or
   `--outDir` lands elsewhere.

##### Production build and run

```sh
npm install          # once — also builds @web10/shared via prepare
npm run build        # shared -> api -> web client bundle -> web SSR bundle
npm start            # node apps/api/dist/main.js, no --dev
```

Confirm both web artifacts exist before starting:

```sh
ls apps/web/dist/index.html
ls apps/web/dist/server/entry-server.js
```

Then open `http://127.0.0.1:3000` and view source: a served page contains
`window.__WEB10_DATA__`. That script is only injected by the SSR middleware, so
its presence proves you are in `ssr` mode. `curl -s localhost:3000 | grep -c
__WEB10_DATA__` gives `1` for SSR, `0` otherwise.

##### Troubleshooting

| Symptom | Mode | Fix |
|---|---|---|
| Page renders empty, then fills in | `client` | `npm run build` |
| `Cannot GET /` on every URL | `api-only` | `npm run build`; check `WEB_DIST_DIR` |
| SSR worked yesterday, not now | `client` | something ran a bare `vite build`; rebuild |
| Boot fails resolving `react` | — | `WEB_DIST_DIR` points outside the repo, so the SSR bundle finds no `node_modules` |

One supporting detail: Vite runs with `appType: 'custom'`, so it never answers
navigation requests; the SSR middleware does, and missing assets still return a
real 404.

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
npm run build        # shared -> API -> client bundle -> SSR bundle, in that order
npm start            # same server, serving the prebuilt React app
npm run typecheck    # typecheck every workspace
```

`npm run dev` is a single process. The API and the dashboard are both served
from `http://127.0.0.1:3000`; there is no second dev port.

`npm start` runs `node apps/api/dist/main.js` and **does not build anything**.
Run `npm run build` first, or the server boots into `client`/`api-only` mode —
see [Serving modes](#serving-modes). The order inside `npm run build` matters
because the web bundle is produced in two steps and the first one empties the
output folder.

Individual packages:

```sh
npm run start:dev -w @web10/api   # same as npm run dev, one level down
npm run build     -w @web10/shared
npm run build     -w @web10/web   # client + SSR bundle; never bare `vite build`
```

Do not run `vite build` directly in `apps/web`: it is only the client half of
the build, and its `emptyOutDir` deletes the SSR bundle next to it.

## Configuration

The API reads `.env` from `apps/api/.env`. Copy `apps/api/.env.example` and set
at least `OPENCODE_PASSWORD`. See `apps/api/README.md` for the full table.

The web app needs no configuration: it always calls `/api` on its own origin.

Optional API settings that affect the modes above:

| Variable | Effect |
|---|---|
| `HOST` | Interface to bind (default `127.0.0.1`). Set `0.0.0.0` on any platform that proxies traffic to the container |
| `PORT` | Port for API, assets and HMR together (default `3000`); platforms inject this |
| `WEB_DIST_DIR` | Overrides `apps/web/dist` for **both** SSR and client-only serving. Keep it inside the repository: the SSR bundle resolves `react` from the nearest `node_modules` |

## Deploying

Any host that runs Node works the same way: build once, then run the compiled
entry point. Nothing is built at startup.

**Render — Node web service**

| Setting | Value |
|---|---|
| Build command | `npm run build` |
| Start command | `npm run start` |
| Health check path | `/api/health` |

`npm install` in the build command is redundant: Render installs dependencies
before running it. Keep it only if you prefer the command to be self-contained.

Required environment variables:

| Variable | Why |
|---|---|
| `HOST=0.0.0.0` | Without it the server binds loopback and Render reports no open ports |
| `OPENCODE_BASE_URL` | Reachable OpenCode server. The default `http://127.0.0.1:4096` only exists on your machine, so classification returns 502 and `/api/health` reports `opencode.ok: false` |
| `OPENCODE_PASSWORD` | Credential for that server |

Do **not** set `PORT`: the platform assigns it and `main.ts` reads it.

Two things that bite on a fresh host:

- The build needs devDependencies (`typescript`, `vite`). If the build fails with
  `tsc: not found`, `NODE_ENV=production` made npm skip them — use
  `npm install --include=dev && npm run build` instead.
- Vite 8 requires Node 20.19+ or 22.12+. If the host defaults to an older 22.x,
  pin it via the platform's Node version setting (or a `.node-version` file).

CORS already allows `chrome-extension://` origins, so the extension can call the
deployed API directly. Same-origin requests from the served page need no CORS at
all.

## Node version

Node 20.19+ (or 22.12+). The `engines` field in the root `package.json` records
this; Vite 8 and React 19 both require it.

## Git note

The root is not a git repository, but `apps/api` is. If you want a single
repository for the whole workspace, remove or relocate `apps/api/.git` first —
otherwise root-level tooling will treat that folder as a foreign repository.

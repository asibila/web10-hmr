# Web10 Jobs API

NestJS API that accepts a job page captured by the Chrome extension, asks a
local OpenCode model to extract the posting, stores it in PostgreSQL, and serves
a faceted search index.

Web10 now focuses on one catalogue: job postings captured from the open web.

This package lives in the Web10 monorepo as `apps/api`. Install and run from the
repository root — see the top-level `README.md`. The commands below work from
either place.

## Requirements

- Node.js 20.19+
- PostgreSQL 14+ (18 is what this machine runs)
- A running local OpenCode server (see `../../AGENTS.md`)
- A model available to that server

## Setup

```sh
# from the repository root
npm install
```

Create the database and role once. From `psql` as a superuser:

```sql
CREATE ROLE web10 LOGIN PASSWORD 'choose-a-password';
CREATE DATABASE web10 OWNER web10;
```

Copy `.env.example` to `.env` **inside this folder** and set at least
`DATABASE_URL` and the OpenCode credentials:

```sh
cd apps/api
cp .env.example .env
```

The schema — the `job_postings` table, its generated `tsvector`, and the search
indexes — is applied at boot with `IF NOT EXISTS` guards. There is no migration
framework in this version; keep schema changes additive in
`src/database/database.service.ts`.

The default OpenCode endpoint is `http://127.0.0.1:4096` and uses HTTP Basic
auth. For local testing, the desktop background service on
`http://127.0.0.1:28894` also works. Its password is stored in
`~/.config/opencode/service.json`; point `OPENCODE_BASE_URL` there and use that
value as `OPENCODE_PASSWORD`.

The model defaults to `opencode-go/deepseek-v4.1-flash` with the `low` variant.
To use a fully local Ollama model instead:

```env
OPENCODE_MODEL_PROVIDER_ID=ollama
OPENCODE_MODEL_ID=qwen3.5:9b
OPENCODE_MODEL_VARIANT=
```

## Run

```sh
# from the repository root: one server, API + React with HMR
npm run dev

# the same thing, scoped to this package
npm run start:dev
```

`start:dev` runs `ts-node src/main.ts --dev`. The `--dev` flag tells the API to
mount the Vite dev server as middleware instead of serving static files, so a
single process on `http://127.0.0.1:3000` answers both API calls and the UI, and
HMR uses that same port.

Build for production:

```sh
npm run build
npm start
```

`npm run build -w @web10/web` runs two Vite builds: the client bundle into
`apps/web/dist` and the SSR entry into `apps/web/dist/server`. Without the `--dev`
flag the API renders HTML per request with that bundle and serves the client
assets statically, so `http://127.0.0.1:3000` is the whole application. Set
`WEB_DIST_DIR` to point at a different build output (production only). If the
SSR bundle is missing the API logs it and falls back to client-only rendering.

## Contract

Request and response types live in `packages/shared` (`@web10/shared`). Change
them there, not here — the React app, the extension payload and the DTOs all
follow that contract.

The central type is `JobPosting`. Every unknown scalar is `null`, and `skills`
is an empty array when nothing was explicit. Enumerations (`work_mode`,
`employment_type`, `seniority`, `salary_period`, `status`) are normalized by
`src/jobs/jobs.normalize.ts`, so a model that answers "on-site" or "Full-Time"
still lands in the right bucket.

## Endpoints

### `GET /api/health`

Checks the API, the OpenCode connection and the database. The database block
includes the number of indexed postings.

### `GET /api/jobs`

Faceted search over the index.

| Query | Type | Notes |
|---|---|---|
| `q` | string | Full-text query over title, company, location and description, with a substring fallback on title/company |
| `company` | string | Case-insensitive contains match |
| `location` | string | Contains match against location, city and country |
| `workMode` | `remote` \| `hybrid` \| `onsite` \| `unknown` | Exact |
| `employmentType` | `full_time` \| `part_time` \| `contract` \| `temporary` \| `internship` \| `freelance` \| `other` | Exact |
| `seniority` | `intern` … `executive` \| `unknown` | Exact |
| `minSalary` | number | Compares an annualized salary, so hourly and monthly postings are ranked fairly |
| `sort` | `newest` \| `salary` \| `relevance` | `relevance` uses the text rank; without `q` it falls back to newest |
| `includeInactive` | boolean | Includes expired and closed postings. Defaults to false |
| `limit` | 1–100 | Defaults to 25 |
| `offset` | number | Defaults to 0 |

Response:

```json
{
  "jobs": [],
  "total": 0,
  "facets": {
    "work_modes": [],
    "employment_types": [],
    "seniorities": [],
    "locations": [],
    "companies": []
  },
  "took_ms": 3
}
```

Each facet bucket is `{ "value": "...", "count": 0 }`, limited to the twelve
most common values per dimension and computed over the same filtered set as the
results.

### `GET /api/jobs/:id`

One posting, or 404 when the UUID is unknown. This is the endpoint behind the
web app's stable `/asset/:id` page, so it also serves pasted links and link
previews.

### `POST /api/jobs`

Accepts a captured page, extracts one posting and upserts it.

```json
{
  "url": "https://jobs.example.com/senior-platform-engineer",
  "title": "Senior Platform Engineer at Nimbus Labs",
  "content": "Nimbus Labs is hiring a Senior Platform Engineer in Lisbon…",
  "jsonLd": [],
  "metadata": { "lang": "en" },
  "capturedAt": "2026-11-20T20:00:00.000Z"
}
```

Response:

```json
{
  "job": { "id": "…", "title": "Senior Platform Engineer", "…": "…" },
  "duplicate": false
}
```

Deduplication is by canonical URL first, then by `(source, external_id)`, so a
re-captured ad refreshes the existing row and returns `"duplicate": true`.

When the page is not an individual job ad, the model returns no job and the API
answers `400` with a readable message. When the model output is malformed the
API answers `502`.

### `DELETE /api/jobs/:id`

Removes one posting. Returns `204`, or `404` when the UUID is unknown.

## Storage

One table, `job_postings`, in `src/database/database.service.ts`:

- `source_url` is unique; `(source, external_id)` is uniquely indexed when the
  external ID is present.
- `search_vector` is a generated `tsvector` over title, company, location and
  description, using the `simple` configuration so non-English pages still
  match.
- Salary columns are `numeric`; `salary_period` records whether the number is a
  yearly, monthly, weekly, daily or hourly amount.
- `skills` is `text[]`.

## Chrome extension

The extension in `../../../chrome-extension` captures the active page and posts
it to `POST /api/jobs`.

1. Run the API.
2. Open `chrome://extensions` (or `brave://extensions`).
3. Enable Developer mode.
4. Load the `chrome-extension` folder unpacked.
5. Open an individual job ad and click the extension, then **Save job**.

Keep the popup open while the model runs; closing it cancels the request. The
extension's API URL is the one line that duplicates `PORT`; it currently points
at `http://127.0.0.1:3000`.

## Configuration reference

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | API port |
| `HOST` | `127.0.0.1` | Bind address |
| `DATABASE_URL` | `postgresql://web10@127.0.0.1:5432/web10` | PostgreSQL connection string |
| `DATABASE_SSL` | empty | Set to `1`/`true` for managed Postgres that requires TLS |
| `OPENCODE_BASE_URL` | `http://127.0.0.1:4096` | OpenCode server |
| `OPENCODE_USERNAME` | `opencode` | Basic auth username |
| `OPENCODE_PASSWORD` | empty | Basic auth password |
| `OPENCODE_MODEL_PROVIDER_ID` | `opencode-go` | Model provider |
| `OPENCODE_MODEL_ID` | `deepseek-v4.1-flash` | Model ID |
| `OPENCODE_MODEL_VARIANT` | `low` | Model variant |
| `OPENCODE_TIMEOUT_MS` | `180000` | Generation timeout |
| `OPENCODE_MAX_CONTENT_CHARS` | `30000` | Page text sent to the model |
| `OPENCODE_MAX_JSONLD_CHARS` | `30000` | JSON-LD sent to the model |
| `WEB_DIST_DIR` | `apps/web/dist` | React build served by the API (production only) |

If the database is unreachable, the API still boots so `/api/health` can report
the failure; job endpoints return an error until the connection is fixed.

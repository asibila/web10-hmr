# Web10 API

Stateless NestJS API that accepts a page captured by the Chrome extension, asks a local OpenCode instance to classify it, and returns the normalized Web10 entity JSON.

This package lives in the Web10 monorepo as `apps/api`. Install and run from the repository root — see the top-level `README.md`. The commands below work from either place.

There is no database in this version. Every request is processed independently.

## Requirements

- Node.js 20.19+
- A running local OpenCode server (see `../../AGENTS.md`)
- A model available to that server

## Setup

```sh
# from the repository root
npm install
```

Copy `.env.example` to `.env` **inside this folder** and set the OpenCode password:

```sh
cd apps/api
cp .env.example .env
```

The server at `http://127.0.0.1:4096` uses HTTP Basic auth. Set `OPENCODE_PASSWORD` to the password configured for that instance. `OPENCODE_USERNAME` defaults to `opencode`.

For local testing, the desktop background service on `http://127.0.0.1:28894` also works. Its password is stored in `~/.config/opencode/service.json`; point `OPENCODE_BASE_URL` there and use that value as `OPENCODE_PASSWORD`.

The model defaults to `opencode-go/deepseek-v4.1-flash` with the `low` variant. To use a fully local Ollama model instead:

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

Request and response types live in `packages/shared` (`@web10/shared`). Change them there, not here — the React app and the DTO both import them.

## Endpoints

### `GET /api/health`

Checks the API and the OpenCode connection.

### `POST /api/classify`

Request:

```json
{
  "url": "https://example.com/listing/123",
  "title": "Useljiva kuća s lijepom okućnicom (prodaja)",
  "content": "Na prodaju useljiva obiteljska kuća u mirnom dijelu Kotoribe...",
  "jsonLd": [
    {
      "@context": "https://schema.org",
      "@type": "Product",
      "name": "Useljiva kuća s lijepom okućnicom",
      "sku": "51081818",
      "offers": {
        "@type": "Offer",
        "price": "85000",
        "priceCurrency": "EUR"
      }
    }
  ],
  "metadata": {
    "description": "Kuća: Kotoriba, 120.00 m2, katnica, samostojeća",
    "lang": "hr"
  },
  "capturedAt": "2026-11-20T20:00:00.000Z"
}
```

Response:

```json
{
  "entity": {
    "category": "real_estate",
    "subcategory": "house_sale",
    "title": "Useljiva kuća s lijepom okućnicom (prodaja)",
    "description_short": "Kuća: Kotoriba, 120.00 m2, katnica, samostojeća, (prodaja)",
    "description_full": "...",
    "external_id": "51081818",
    "sku": "51081818",
    "object_code": null,
    "listing_type": "HOUSE",
    "offer_type": "for_sale",
    "state": "ACTIVE",
    "created_at": null,
    "expires_at": null,
    "view_count": null
  }
}
```

Unknown fields are returned as `null`. The API does not store the request or the result.

## Chrome extension

The extension in `../../chrome-extension` captures the active page and posts it to this API.

1. Run the API.
2. Open `chrome://extensions` (or `brave://extensions`).
3. Enable Developer mode.
4. Load the `chrome-extension` folder unpacked.
5. Open a normal website and click the extension, then **Classify page**.

Keep the popup open while the model runs; closing it cancels the request.

## Configuration reference

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | API port |
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

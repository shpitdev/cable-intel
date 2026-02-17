# cable-intel

Monorepo for cable intelligence tooling.

## Stack

- `apps/web`: SvelteKit frontend
- `apps/tui`: terminal UI
- `packages/backend`: Convex backend
- `packages/env`: shared environment validation
- `packages/shopify-cable-source`: Shopify template/source extraction package

## Setup

```bash
bun install
bun run dev:setup
```

`dev:setup` configures Convex (`packages/backend`).

## Run

```bash
bun run dev
```

Web app: `http://localhost:5173`

## Useful Scripts

- `bun run dev`: run workspace dev tasks
- `bun run build`: run workspace build tasks
- `bun run check-types`: run type checks
- `bun run check`: run Ultracite checks
- `bun run fix`: apply Ultracite fixes

## Ingest Notes

- Backend ingest is Shopify-first with Firecrawl + AI fallback.
- `AI_GATEWAY_API_KEY` and `FIRECRAWL_API_KEY` are required for fallback runs.
- Shopify-only ingest paths run without those keys.

## Current Product Focus

- End-user flow is cable identification + label assignment (`velcro + adapter color`).
- Users can identify via ingested catalog rows (Anker v1) or via markings-based input.
- Ingested brands are a fast path, not a hard dependency for using the labeling flow.

See `docs/ARCHITECTURE_SPEC.md` for current workflow and next activity.

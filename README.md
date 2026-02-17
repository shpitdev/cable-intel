# cable-intel

Monorepo for cable intelligence tooling.

## Stack

- `apps/web`: SvelteKit frontend
- `apps/tui`: terminal UI
- `packages/backend`: Convex backend
- `packages/env`: shared environment validation

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

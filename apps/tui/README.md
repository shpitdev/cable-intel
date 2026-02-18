# cable-intel TUI

Terminal manager for ingest operations (discover URLs, run seed ingest, and
view quality summary) without needing an admin web page.

## Setup

```bash
bun install
```

## Run

Interactive mode:

```bash
bun run --cwd apps/tui start
```

Watch mode:

```bash
bun run --cwd apps/tui dev
```

Non-interactive examples:

```bash
bun run --cwd apps/tui start --vercel-url https://www.cableintel.com --seed-max 20 --yes
bun run --cwd apps/tui start --deployment-name enduring-partridge-214 --report-only --yes
```

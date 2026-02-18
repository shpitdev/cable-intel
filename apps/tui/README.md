# cable-intel TUI

Terminal manager for ingest operations (discover URLs, run seed ingest, and
view quality summary) without needing an admin web page.

Works in standard terminals, including Ghostty, WezTerm, iTerm2, and Terminal.

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

## Build Binary Locally

```bash
bun run --cwd apps/tui build:bin
./apps/tui/dist/cable-intel-tui --help
```

## GitHub Release Bundles

Tag pushes matching `tui-v*` or `v*` trigger `.github/workflows/tui-release.yml`.
That workflow builds standalone binaries for:

- Linux x64
- macOS arm64
- Windows x64

Assets are attached automatically to the GitHub Release.

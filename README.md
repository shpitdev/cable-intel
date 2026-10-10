# Cable Intel

Cable Intel helps you identify cables quickly, label them consistently, and avoid trial-and-error.

[![Runtime: Bun](https://img.shields.io/badge/runtime-Bun-black?logo=bun)](https://bun.sh/)
[![Frontend: SvelteKit](https://img.shields.io/badge/frontend-SvelteKit-ff3e00?logo=svelte)](https://kit.svelte.dev/)
[![Backend: Convex](https://img.shields.io/badge/backend-Convex-111111)](https://www.convex.dev/)
[![CI: GitHub Actions](https://img.shields.io/badge/ci-GitHub_Actions-2088FF?logo=githubactions)](https://docs.github.com/actions)
[![Deploy: Vercel](https://img.shields.io/badge/deploy-Vercel-000000?logo=vercel)](https://vercel.com/)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

## What It Does

- Identifies cables from catalog data or free-text printed markings.
- Infers connector/power/data/video capabilities and summarizes expected behavior.
- Suggests deterministic physical label colors for strap and holder classes.
- Supports catalog filtering (brand, connector type, length, color, price bucket).
- Includes a TUI for ingest discovery, seeding, and quality checks.

## How It Works

- `apps/web`: SvelteKit workspace UI (catalog + manual flows).
- `packages/backend`: Convex schema/actions/queries and ingest pipeline.
- `packages/shopify-cable-source`: Shopify source discovery/extraction.
- `apps/tui`: terminal ingest manager.
- Preview deployments run `preview-validation` (seed + runtime QA + browser smoke with artifacts/replay links).

## Quick Start

```bash
mise install
mise exec -- bun install
bun run dev:setup
bun run dev
```

Web app: `http://localhost:5173`. `mise.toml` pins Node 24.21.0 and Bun 1.4.2 for local work and CI; Vercel uses an explicit `bunx bun@1.4.2` install/build command and the Node 24 engine. Its build script verifies the actual Bun version against `packageManager`.

## Testing And CI

| Layer | Present | Tooling | Runs in CI |
|---|---|---|---|
| unit | yes | `bun run test:unit` | yes |
| integration | yes | `bun test` integration suites | no |
| e2e api | yes | `bun test packages/backend/convex/ingest.e2e.test.ts` | no |
| e2e web | yes | pinned `agent-browser` smoke scripts | local fields in CI; inference/reset on preview |

`bun run check-types` checks the web, backend, source package, and TUI. For local
checks without a backend, set `PUBLIC_CONVEX_URL=https://placeholder.convex.cloud`.
The local browser check deliberately disables Convex and does not claim inference
or reset coverage. Live source/provider integration tests remain separate and need
network access and the documented provider credentials.

Primary CI workflows:
- `.github/workflows/ci.yml` (quality + local browser smoke + build)
- `.github/workflows/preview-seed.yml` (preview seed + browser QA)
- `.github/workflows/org-required-checks.yml` (required merge gate)

## Deployment And External Services

- Deploy target: Vercel (`vercel.json`)
- Data/backend: Convex
- LLM path: AI Gateway/OpenAI-compatible via `ai` SDK
- Optional analytics: `PUBLIC_VERCEL_ANALYTICS_DSN` (already wired in `apps/web/src/routes/+layout.ts`)

Preview automation secrets:
- `CONVEX_DEPLOY_KEY_PREVIEW`
- `BROWSERBASE_API_KEY`
- `BROWSERBASE_PROJECT_ID`
- `VERCEL_AUTOMATION_BYPASS_SECRET`

## API Surface

There is no public REST API in this repo. App/backend integration is via Convex actions and queries.

## Active Backlog

- Search quality phase 2: semantic rerank + measured eval ([#92](https://github.com/shpitdev/cable-intel/issues/92))

## License

MIT License. See [LICENSE](./LICENSE).

Copyright 2026 SHPIT LLC.

# Cable Intel

Cable Intel helps people with large cable collections identify the right cable fast, apply a consistent physical label system, and stop relying on memory, random tests, or spreadsheets.

## Why This Exists

When you have dozens or hundreds of cables on a wall, day-to-day cable choice is slow and error-prone.

| Pain | Typical workaround | What Cable Intel changes |
|---|---|---|
| "I cannot tell what this cable can do from a quick glance." | Search product pages manually or test against devices. | Identify by catalog row or markings, then get a capability profile immediately. |
| "My labels are inconsistent." | Invent a personal color system and hope everyone follows it. | Generate deterministic `velcro strap + holder` color recommendations from cable capability. |
| "I lose track of duplicates and what needs to be re-printed." | Keep ad hoc notes/spreadsheets. | Moves toward a virtual wall and inventory-first workflow (planned). |

Works well with physical systems like Multiboard + 3D printed holders, where consistency matters.

## What Exists Now

- Web workspace for cable identification and label assignment.
- Two identification paths:
  - Catalog path (Anker-first ingest today).
  - Manual markings path (works even when catalog has no match).
- Automatic color output:
  - `Velcro strap color` for data/video class.
  - `Holder color` for charging/power class.
- Capability summary with practical guidance for power, data, and video expectations.
- Catalog search and filtering (brand, connector type, length, color; price facet is scaffolded but price ingest is pending).
- Convex ingest pipeline that stores evidence-backed normalized specs and quality state.
- TUI ingest manager for discovery, seed runs, and quality reporting.

See `docs/ARCHITECTURE_SPEC.md` for architecture details.

## Future Features Under Consideration

These are open TODO/spike items already tracked in GitHub:

| Candidate | Pain solved | Status |
|---|---|---|
| Free-text, conversational manual identification with targeted follow-up questions | Reduces form friction when users only remember partial details | https://github.com/anand-testcompare/cable-intel/issues/3 |
| Hybrid search + price ingest (facets + lexical + semantic rerank) | Improves "find the right cable" speed for natural-language queries | https://github.com/anand-testcompare/cable-intel/issues/2 |
| Automatic seeding for new preview/prod deployments | Prevents empty catalogs after deploy and cuts manual ops overhead | https://github.com/anand-testcompare/cable-intel/issues/40 |

## Product Planning (Working Draft)

Current constraint: there is no auth, no multi-user model, and no per-user saved workspace yet. That is the major platform unlock for personalization and collaboration.

### Big Dependencies

| Dependency | Why it matters | Unlocks |
|---|---|---|
| Need-profile engine (task requirements + matching explanations) | Converts "will this cable work for what I do all the time?" into a repeatable check | Use-case fit advisor before buying/using a cable; saved recurring checks |
| Auth + workspace model (user/team identity and ownership) | Lets data belong to a person or team instead of one global state | Custom color systems, personal inventory, shared wall management, collaboration |
| Physical inventory model (cable instances separate from catalog variants) | Required to track duplicates and real-world state of each cable | Virtual wall, in-use vs on-wall status, low-stock and "print more" alerts |

### Sequenced Backlog (Value vs Complexity)

| Order | Candidate | Pain solved | Depends on | Value | Complexity | Tracking |
|---|---|---|---|---|---|---|
| 1 | Use-case fit advisor (check a cable against repeated workflows) | Reduces uncertainty like "will this reliably handle my laptop + display workflow?" | Need-profile engine + existing capability profile | High | Medium | Idea (no issue yet) |
| 2 | Hybrid catalog search + price ingest | Faster catalog lookup with natural phrasing and budget awareness | Ingest/schema updates + ranking pipeline | High | Medium-High | https://github.com/anand-testcompare/cable-intel/issues/2 |
| 3 | Free-text manual identification + targeted follow-up questions | Less manual form entry and better disambiguation | Prompt + confidence loop design | High | Medium | https://github.com/anand-testcompare/cable-intel/issues/3 |
| 4 | Auth + multi-user workspaces | Enables persistent per-user/team state and collaboration | Identity/session + data ownership model | Very High | High | Idea (no issue yet) |
| 5 | Custom color systems by user/workspace (strap + holder profiles) | Supports personalized labeling systems and real material choices | Auth/workspaces | Medium-High | Medium | Idea (no issue yet) |
| 6 | Virtual wall + cable inventory tracking | Replaces spreadsheets for duplicates, location, and usage state | Auth/workspaces + physical inventory model | Very High | High | Idea (no issue yet) |
| 7 | "Print more" planner and stock alerts | Reduces holder/label stock surprises and planning overhead | Inventory tracking + holder/label metadata | Medium-High | Medium | Idea (no issue yet) |

## Repository Layout

- `apps/web`: SvelteKit frontend workspace
- `apps/tui`: terminal ingest manager
- `packages/backend`: Convex schema/functions and ingest workflow
- `packages/env`: shared environment validation
- `packages/shopify-cable-source`: Shopify template/source extraction

## Quick Start

```bash
bun install
bun run dev:setup
bun run dev
```

Web app: `http://localhost:5173`

## Useful Commands

- `bun run dev`: run workspace dev tasks
- `bun run build`: run workspace build tasks
- `bun run check-types`: run type checks
- `bun run check`: run Ultracite checks
- `bun run fix`: apply Ultracite fixes
- `bun run seed:realistic -- --deployment-name <name>`: discover and seed a multi-brand realistic dataset for local search QA
- `bun run seed:vercel-deployment -- --vercel-url <deployment-url>`: map Vercel URL to Convex deployment, run seed ingest, print quality summary
- `bun run --cwd apps/tui start`: interactive ingest manager
- `bun run --cwd apps/tui build:bin`: build standalone TUI binary at `apps/tui/dist/cable-intel-tui`

## Testing And CI

| Layer | Present | Tooling | Runs in CI |
|---|---|---|---|
| unit | yes | `bun test` (example: `apps/web/src/lib/*.test.ts`, `packages/backend/convex/*.test.ts`) | no |
| integration | yes | `bun test` integration suites | yes |
| e2e api | yes | `bun test packages/backend/convex/ingest.e2e.test.ts` | no |
| e2e web | no | none | no |

CI (`.github/workflows/ci.yml`) currently runs:
- `ultracite check`
- Convex Shopify ingest integration test
- Shopify source integration test
- workspace build
- TUI compile smoke test

## Deployment And External Services

- Deployment target: Vercel (`vercel.json`)
- Backend/data: Convex
- Fallback ingest providers: Firecrawl + AI Gateway/OpenAI-compatible model via `ai` SDK

Environment notes:
- `PUBLIC_CONVEX_URL` is required by the web app.
- `AI_GATEWAY_API_KEY` and `FIRECRAWL_API_KEY` are required only for fallback ingest mode.
- Shopify-only extraction path works without those fallback provider keys.
- Optional web analytics: `PUBLIC_VERCEL_ANALYTICS_DSN`.
- Preview seed automation exists in `.github/workflows/preview-seed.yml`.

## Release Automation

- Pushes to `main` create a version bump PR (`chore: bump version to x.y.z`).
- Auto-merge is enabled on that PR after review.
- When merged, GitHub Release `vX.Y.Z` is created.
- Tag pushes trigger TUI binary bundles via `.github/workflows/tui-release.yml`.

## License

No repository-level license file is currently committed.

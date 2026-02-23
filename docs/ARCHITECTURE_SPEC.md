# Cable Intel Architecture (Current)

Status: Active  
Last updated: 2026-02-23

This document is a technical implementation reference.

Product scope, roadmap, and prioritization live in `README.md`.
If this document and `README.md` ever diverge, treat `README.md` as the product source of truth and update this file.

## User Outcomes This Architecture Supports

1. Identify cable capability quickly from either:
   - Catalog rows (fast path), or
   - Manual markings (fallback path).
2. Produce deterministic physical labels:
   - `velcro strap color` for data/video class,
   - `holder color` for charging/power class.
3. Keep catalog data reliable enough for user decisions using provenance, validation, and quality gating.

## System Shape

- `apps/web` (SvelteKit): end-user workspace.
- `packages/backend/convex` (Convex): ingest workflow, normalized storage, quality gates, query surface.
- `apps/tui` (Bun + OpenTUI): ingest/quality operations without requiring an admin web UI.
- `packages/shopify-cable-source`: Shopify-first discovery/extraction helpers.

## Web App Architecture

The web app has one main flow with two entry modes.

1. `Catalog mode`
   - Reads top-quality rows from Convex.
   - Supports search + facets (brand/type/length/color; price facet scaffolded).
   - User selects a row to view normalized capability profile.
2. `Manual markings mode`
   - User enters printed markings (connectors, wattage, usb generation, video hints).
   - App infers a normalized capability profile without requiring a catalog match.
3. Shared output
   - Label recommendation (`velcro + holder`).
   - Capability summary for power/data/video guidance.

Implementation anchors:
- Label logic: `apps/web/src/lib/labeling.ts`
- Label tests: `apps/web/src/lib/labeling.test.ts`
- Main workspace route: `apps/web/src/routes/+page.svelte`

## Ingest Architecture (Convex Workflow)

Ingest runs as a resumable workflow with per-URL state.

1. Target resolution
   - Input seed URLs are normalized/canonicalized/deduped.
   - URL items are persisted in `ingestionWorkflowItems`.
2. Shopify-first extraction
   - If URL matches known Shopify patterns, extract structured cable fields from Shopify sources.
3. Firecrawl + AI fallback
   - If Shopify extraction does not apply or fails, scrape snapshots and parse with AI.
   - Fallback mode requires provider keys.
4. Validation + persistence
   - Parsed output is validated against strict contracts.
   - Normalized rows are upserted with evidence references.
5. Quality gating
   - Rows are marked `ready` or `needs_enrichment`.
   - User-facing catalog queries prioritize `ready` rows.

## Minimal Data Model (V1)

- `ingestionWorkflows`: workflow run status/counters.
- `ingestionWorkflowItems`: per-URL processing state.
- `evidenceSources`: source URL + snapshot metadata.
- `cableVariants`: user-facing cable identities.
- `normalizedSpecs`: parsed capabilities + evidence refs.
- enrichment queue/state tables used for low-quality row follow-up.

## Operational Interfaces

- TUI commands for seed + quality report:
  - `bun run --cwd apps/tui start`
  - `bun run seed:vercel-deployment -- --vercel-url <deployment-url>`
- CI preview seed automation:
  - `.github/workflows/preview-seed.yml`

## Boundaries (Current)

- No auth / multi-user workspace model yet.
- No persistent per-user inventory/wall model yet.
- No marketplace/pricing decision layer in user flow yet.
- Keep ingest and user interaction concerns separate.

## Next Major Technical Dependencies

These align with product planning in `README.md`.

1. Need-profile engine
   - Structured representation of recurring user tasks to score cable fit.
2. Auth + workspace ownership model
   - Required for per-user/team preferences and collaboration.
3. Physical inventory model
   - Required for duplicate tracking, wall state, and print-planning features.

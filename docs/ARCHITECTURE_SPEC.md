# Cable Intel Architecture (Simple)

Date: 2026-02-17
Status: Active
Stack: SvelteKit + TypeScript + Convex + Firecrawl + AI SDK 6 (`ai`)

## 1) System Split

### Ingest (backend)
Scope: discovering product pages, snapshotting content, and extracting normalized cable specs.

### UI (frontend)
Scope: helping users identify cable capabilities quickly and assign physical labeling (velcro + adapter color), with ingested catalog data used as a fast path when available.

---

## 2) Ingest Architecture (Convex Workflow)

Ingest runs as a Convex workflow. Each run is resumable and tracks per-URL status.

### Step 1: Resolve ingest targets
- Input comes from caller-provided `seedUrls`.
- Normalize, canonicalize, domain-filter, and dedupe.
- Persist URL list into `ingestionWorkflowItems`.

### Step 2: Shopify-first extraction
- Match URL against known Shopify templates.
- If matched, extract structured cable specs from Shopify data endpoints.
- Persist source snapshots (`html`/`markdown`) and parsed outputs exactly like non-Shopify paths.

### Step 3: Firecrawl + AI fallback
- If Shopify extraction does not apply or produces no result, scrape via Firecrawl and parse with AI.
- Store raw `html` and `markdown` snapshots with:
  - `url`
  - `fetchedAt`
  - `contentHash`
  - `workflowRunId`
- Keep snapshots immutable once referenced by parsed specs.

### Step 4: Parse relevant info with AI
- Use AI SDK 6 (`ai`) with a tool-loop agent.
- Model: `openai/gpt-oss-120b`.
- No provider-specific SDK wiring; use the `ai` dependency directly.
- Agent output must match a strict schema for cable fields.

Minimal extraction targets:
- Brand, model, variant/SKU
- Connector pair
- Power capability (max watts, PD/EPR when available)
- Data capability (USB generation / Gbps)
- Video capability (if explicitly supported)
- Evidence pointers back to source snapshots

### Persist + Validate
- Validate parsed output with deterministic rules.
- Upsert normalized cable records.
- Require evidence references for critical fields.
- Mark each workflow item: `completed` / `failed`.

### Ingest boundaries
- Keep this pipeline simple: no reflection loop, no contradiction queue, no pricing.

### Provider key behavior (current)
- `AI_GATEWAY_API_KEY` and `FIRECRAWL_API_KEY` are required for fallback mode (Firecrawl + AI).
- Shopify-only extraction paths run without those keys.
- Provider config is loaded lazily only when fallback is needed.

---

## 3) AI Extraction Contract

### Input
- Snapshot content (`html`, `markdown`) + source metadata.

### Output
- Structured cable object matching the app schema.
- Field-level evidence mapping to source URL/snapshot.

### Failure handling
- Retry item with capped backoff.
- If still failing, mark item failed and continue run.

---

## 4) UI Architecture

UI has two jobs only.

### A) Identify a cable and assign labels
- User can identify a cable through either path:
  - Catalog fast path: pick an ingested cable (Anker now, more brands later).
  - Markings path: enter markings/print details (connector ends, wattage, data/video hints) when catalog match is missing.
- UI returns inferred/known capability profile (power/data/video + connector pair).
- UI suggests labeling output: `velcro color + 3D printed adapter color`.
- User can override suggested labels before confirming.

### B) Match need to cable capability
- User asks for a need (example: “USB-C to USB-C, charging laptop + external display”).
- UI compares need against selected/identified cable capabilities.
- Results show pass/partial/fail with short explanation of power/data/video constraints.

### UI boundaries
- No giant decision trees.
- No marketplace/pricing logic.
- Focus on fast identification + labeling.

---

## 5) Minimal Data Model (V1)

- `ingestionWorkflows`: workflow run state and counts
- `ingestionWorkflowItems`: per-URL processing state
- `evidenceSources`: URL + snapshot metadata
- `cableVariants`: user-facing cable identity records
- `normalizedSpecs`: strict parsed capabilities + evidence refs

---

## 6) Implementation Notes (Direct)

- Keep ingest and UI code paths separate.
- Ingest produces normalized, evidence-backed data.
- UI reads normalized capability data and exposes identification/matching flows.
- Complexity gets removed, not deferred into hidden layers.

---

## 7) Next Activity (Recommended)

### Build end-user cable matching UI (Anker-first)
Goal: ship a usable end-user flow now, using current ingest data as-is.

Scope:
- Keep ingest manual for now (run locally/ops when catalog refresh is needed).
- Build a user-facing web flow with two entry modes:
  - catalog lookup (Anker rows first),
  - markings-based inference (works even without ingest match).
- Add label recommendation output using catalog rules:
  - `velcro color` for data/video class,
  - `adapter color` for charging class.
- Add need-matching panel that evaluates a cable profile against user need and explains pass/partial/fail.
- Restrict first release catalog fast path to Anker-derived rows and make that explicit in copy.

Acceptance criteria:
- User can identify a cable from catalog rows or markings input.
- User gets a recommended `velcro + adapter` label pair from either path.
- User can run a basic compatibility check from stated need to cable profile.
- UI clearly labels catalog lookup as Anker-only v1 and indicates multi-brand ingest is future work.

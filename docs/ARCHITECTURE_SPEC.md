# Cable Intel Architecture (Simple)

Date: 2026-02-17
Status: Active
Stack: SvelteKit + TypeScript + Convex + Firecrawl + AI SDK 6 (`ai`)

## 1) System Split

### Ingest (backend)
Owns: discovering product pages, snapshotting content, and extracting normalized cable specs.

### UI (frontend)
Owns: helping users quickly categorize cables they already have, or find a cable from their collection.

---

## 2) Ingest Architecture (Convex Workflow)

Ingest runs as a Convex workflow. Each run is resumable and tracks per-URL status.

### Step 1: Get links
- Use Firecrawl map/crawl on allowed catalog domains.
- Merge optional seed URLs.
- Canonicalize + dedupe URLs.
- Save URL list to workflow items.

### Step 2: Extract HTML/Markdown snapshots
- For each URL, call Firecrawl scrape.
- Store raw `html` and `markdown` snapshots with:
  - `url`
  - `fetchedAt`
  - `contentHash`
  - `workflowRunId`
- Keep snapshots immutable once referenced by parsed specs.

### Step 3: Parse relevant info with AI
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

### A) Categorize my cable
- User selects an existing cable from their collection (or adds a quick description/photo).
- UI shows best category matches.
- User confirms category/tag quickly.

### B) Find a cable in my collection
- User asks for a need (example: “USB-C to USB-C, charging laptop + external display”).
- UI filters/ranks cables from their saved collection.
- Results show why each cable matches (power/data/video evidence).

### UI boundaries
- No giant decision trees.
- No marketplace/pricing logic.
- Focus on fast, clear categorization + retrieval from existing collection.

---

## 5) Minimal Data Ownership

- `ingestionWorkflows`: workflow run state and counts
- `ingestionWorkflowItems`: per-URL processing state
- `evidenceSources`: URL + snapshot metadata
- `cableVariants`: user-facing cable identity records
- `normalizedSpecs`: strict parsed capabilities + evidence refs
- `userOwnedCables`: user-to-cable collection records (`userId`, `variantId`, optional per-user metadata like condition/notes/visibility)

---

## 6) Implementation Notes (Direct)

- Keep ingest and UI code paths separate.
- Ingest produces normalized, evidence-backed data.
- UI only reads normalized data + user collection metadata.
- Complexity gets removed, not deferred into hidden layers.

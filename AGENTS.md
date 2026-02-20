# Agent Guide (Ultracite + Autonomy + Data Quality)

This repo uses **Ultracite** (Biome) for formatting + linting. Prefer simple, explicit code and keep the project easy to change.

## Quick commands

- **Format + fix**: `bun x ultracite fix`
- **Check (CI-style)**: `bun x ultracite check`
- **Diagnose tooling**: `bun x ultracite doctor`

---

## Operating principles (what “good” looks like)

1. **Ship maintainable changes**: clear intent, low cognitive load, type-safe, accessible, secure.
2. **Prefer deletion over preservation**: if you refactor, remove old paths. Avoid keeping parallel implementations.
3. **Make progress autonomously**: don’t stop at “requested change done” if there’s an obvious adjacent technical completion.
4. **Be honest about uncertainty**: when you can’t confirm something, say so and add checks/logging/tests rather than guessing.
5. **Data quality is a first-class feature**: if the system pulls from sources, treat correctness and provenance as requirements.

---

## Autonomy rules (default behavior)

You should proceed without asking for confirmation when the work is:

- A clear bug fix, type-safety improvement, or dead-code removal
- A refactor that *reduces* complexity and deletes the old version
- Adding missing tests, assertions, or validation needed to make existing behavior reliable
- Improving observability (structured logs/metrics) to verify behavior
- Tightening security defaults (e.g., `rel="noopener"` on external links)

You must ask before:

- Introducing a new feature that isn’t implied by existing code or we haven’t discussed as needed/valuable
- Making a large dependency addition or major architectural change

After completing a task, do one more pass:
- Identify the next highest-leverage cleanup directly related to the change and do it (unless it would change behavior).

---

## Core engineering standards (trimmed)

### TypeScript / JavaScript

- Use `const` by default; `let` only when reassignment is required.
- Prefer `unknown` over `any`; narrow with guards instead of assertions.
- Use `as const` for literal/immutable objects when it improves types.
- Prefer `for...of` for loops with side effects; avoid accumulator spreads in hot paths.
- Avoid cleverness; name things clearly and extract magic numbers into constants.

### Async / errors

- Always `await` promises you create or call in `async` functions.
- Use `try/catch` where you can add meaning: context, fallback, or cleanup.
- Throw `Error` objects with descriptive messages (include key identifiers).
- Fail fast with early returns to reduce nesting.

### Security

- Add `rel="noopener"` for `target="_blank"`.
- Don’t use `eval()`.
- Validate and sanitize external input (network, files, env vars, user input).
- Avoid `dangerouslySetInnerHTML` unless absolutely necessary and justified.

### Performance (practical)

- Don’t allocate in tight loops unnecessarily.
- Use top-level regex literals (don’t build regexes repeatedly in loops).
- Prefer specific imports over namespace imports when reasonable.

### React / Next.js (when applicable)

- Function components only; hooks at top-level only.
- Use semantic HTML + accessible labels/alt text; keyboard support with mouse handlers.
- Next.js: prefer `<Image>` for images; use appropriate metadata APIs for head content.
- Avoid defining components inside components.

### Testing

- Put assertions inside `test()`/`it()` blocks.
- Use `async/await` (no `done` callbacks).
- Never commit `.only`/`.skip`.
- Keep suites flat; test behavior and edge cases, not implementation trivia.

---

## Data quality & provenance (required)

Any code that **ingests, scrapes, syncs, or transforms external data** must include:

- **Provenance**: where the data came from (source URL/system, timestamp, identifiers).
- **Normalization**: deterministic transforms (documented and testable).
- **Validation**: schema/shape checks and constraints (reject or quarantine bad data).
- **Traceability**: ability to map a stored field back to a source attribute.

### Visual grading (always include in PRs / summaries)

When you touch data ingestion, parsing, or derived fields, include a **Data Quality Grade** using this rubric:

- **A**: strong provenance + robust validation + idempotent transforms + good coverage/monitoring
- **B**: provenance + basic validation; some edge cases known but bounded
- **C**: partial provenance or weak validation; correctness depends on assumptions
- **D**: brittle parsing, unclear provenance, or frequent silent fallbacks
- **F**: unvalidated/untraceable data or behavior that can silently corrupt outputs

Alongside the grade, include:

1. **Source(s)**: what you pull from and why it’s authoritative
2. **Assumptions**: explicit assumptions about the source format/semantics
3. **Failure modes**: what happens on missing/invalid/changed source data
4. **Detection**: how issues are surfaced (logs/metrics/tests) vs silently ignored
5. **Backfill/replay** (if relevant): can you re-run deterministically without duplication?

### “Compare to source” checklist (do this before you call it done)

- [ ] Sampled real source payloads/records and compared derived fields
- [ ] Verified units/timezones/encodings and identifier stability
- [ ] Confirmed null/empty/unknown semantics (don’t coerce silently)
- [ ] Added at least one guardrail: schema validation, invariant checks, or tests
- [ ] Logged/flagged anomalies with enough context to debug (no noisy spam)

If you can’t verify against the source (no access / no sample data), say so clearly and:
- add validation + logging to detect drift,
- add tests using representative fixtures,
- grade no higher than **C**.

---

## Workflow (lightweight)

- Prefer small, coherent commits.
- Keep branches tidy; delete stale branches.
- Keep required checks fast and merge-critical; rely on auto-merge when enabled.
- Before finalizing: run `bun x ultracite fix`, then `bun x ultracite check`.

---

## Git decision policy

- Do not ask the user about routine git nuance.
- Analyze impact first: inspect working tree, commit content, branch state, and CI/merge requirements.
- After analysis, choose the safest correct git action and execute it.
- Default to autonomous git handling (branching, rebasing/merging, pushing, PR updates, and enabling auto-merge) unless the action is destructive.
- Only interrupt for explicit destructive-risk operations or conflicting product intent that cannot be resolved from repo context.

---

## When tooling can’t help

Formatters and linters can’t ensure:
- business correctness,
- good naming,
- sound architecture,
- correct edge-case handling,
- good UX/accessibility,
- data correctness vs the real source.

Prioritize those over micro-style debates.

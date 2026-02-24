# Browser QA

This repository includes a repeatable headless browser smoke test powered by `agent-browser`.

## Local run

```bash
bun run qa:browser
```

Output artifacts are written to `artifacts/browser-qa/`:

- `01-home.png`
- `02-manual-entry.png`
- `03-after-enter.png`
- `04-wattage-edit.png`
- `05-after-reset.png`
- `results.json`
- `summary.md`

## Browserbase replay support

To force Browserbase-backed runs and produce replay URLs:

```bash
export USE_BROWSERBASE=1
export BROWSERBASE_API_KEY=...
export BROWSERBASE_PROJECT_ID=...
bun run qa:browser
```

The replay URL is captured in `results.json` as `browserbaseReplayUrl`.

## CI behavior

`ci.yml` now runs as one staged pipeline:

1. `Stage 1 - Quality`
2. `Stage 2 - Browser QA`
3. `Stage 3 - Integration + Build`

Stage 2 uploads screenshots as artifacts and posts replay/artifact links on PRs.

`tui-release.yml` also runs browser QA, uploads screenshots to release artifacts, and appends the Browserbase replay URL to release notes.

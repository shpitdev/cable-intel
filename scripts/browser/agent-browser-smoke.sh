#!/usr/bin/env bash

set -euo pipefail

BASE_URL="http://127.0.0.1:4173"
OUT_DIR=""
SESSION_NAME="cable-intel-qa-$(date +%s)"
USE_BROWSERBASE="${USE_BROWSERBASE:-0}"
LOCAL_ONLY="0"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --local-only)
      LOCAL_ONLY="1"
      shift
      ;;
    --base-url)
      BASE_URL="$2"
      shift 2
      ;;
    --out-dir)
      OUT_DIR="$2"
      shift 2
      ;;
    --session-name)
      SESSION_NAME="$2"
      shift 2
      ;;
    --use-browserbase)
      USE_BROWSERBASE="1"
      shift 1
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$OUT_DIR" ]]; then
  OUT_DIR="artifacts/browser-qa/$(date +%Y%m%d-%H%M%S)"
fi
mkdir -p "$OUT_DIR"
OUT_DIR="$(cd "$OUT_DIR" && pwd)"

BB_SESSION_ID=""
BB_CONNECT_URL=""
BB_REPLAY_URL=""

ab() {
  bunx --no-install agent-browser --session "$SESSION_NAME" "$@"
}

ab_json() {
  bunx --no-install agent-browser --session "$SESSION_NAME" --json "$@"
}

cleanup() {
  ab close >/dev/null 2>&1 || true
}
trap cleanup EXIT

if [[ "$USE_BROWSERBASE" == "1" ]]; then
  if [[ -z "${BROWSERBASE_API_KEY:-}" ]]; then
    echo "BROWSERBASE_API_KEY is required when USE_BROWSERBASE=1" >&2
    exit 1
  fi
  if [[ -z "${BROWSERBASE_PROJECT_ID:-}" ]]; then
    echo "BROWSERBASE_PROJECT_ID is required when USE_BROWSERBASE=1" >&2
    exit 1
  fi

  BB_CREATE_PAYLOAD="$(
    jq -n \
      --arg projectId "$BROWSERBASE_PROJECT_ID" \
      --arg runId "${GITHUB_RUN_ID:-local}" \
      --arg sha "${GITHUB_SHA:-local}" \
      '{
        projectId: $projectId,
        userMetadata: {
          source: "cable-intel-agent-browser-smoke",
          runId: $runId,
          sha: $sha
        }
      }'
  )"

  BB_CREATE_RESPONSE="$(
    curl -fsS \
      --request POST \
      --url "https://api.browserbase.com/v1/sessions" \
      --header "Content-Type: application/json" \
      --header "X-BB-API-Key: ${BROWSERBASE_API_KEY}" \
      --data "$BB_CREATE_PAYLOAD"
  )"

  BB_SESSION_ID="$(echo "$BB_CREATE_RESPONSE" | jq -r '.id')"
  BB_CONNECT_URL="$(echo "$BB_CREATE_RESPONSE" | jq -r '.connectUrl')"

  if [[ -z "$BB_SESSION_ID" || "$BB_SESSION_ID" == "null" ]]; then
    echo "Failed to create Browserbase session: missing id" >&2
    echo "$BB_CREATE_RESPONSE" >&2
    exit 1
  fi
  if [[ -z "$BB_CONNECT_URL" || "$BB_CONNECT_URL" == "null" ]]; then
    echo "Failed to create Browserbase session: missing connectUrl" >&2
    echo "$BB_CREATE_RESPONSE" >&2
    exit 1
  fi

  BB_REPLAY_URL="https://browserbase.com/sessions/${BB_SESSION_ID}"
  ab connect "$BB_CONNECT_URL"
fi

ab open "$BASE_URL" >/dev/null
ab wait --text "Catalog Results"
ab screenshot --full body "$OUT_DIR/01-home.png"

ab find role button click --name "Manual entry"
ab wait --text "Live Cable Profile"
ab screenshot --full body "$OUT_DIR/02-manual-entry.png"

if [[ "$LOCAL_ONLY" != "1" ]]; then
  ab wait --fn "!document.body.innerText.includes('workspace data is reconnecting')"
  ab find label "Cable description" fill "usb c to usb c 240w USB 3.2 Gen 1"
  ab find role button click --name "Enter" --exact
  ab wait --fn "document.querySelector('.manual-error') || document.body.innerText.includes('5Gbps')"
  ab wait --fn "!Array.from(document.querySelectorAll('button')).some(b => b.textContent.trim() === 'Inferring...')"
  ab_json eval "document.querySelector('.manual-error')?.textContent ?? ''" > "$OUT_DIR/inference-error.json"
  jq -e '.data.result == ""' "$OUT_DIR/inference-error.json" >/dev/null
fi
ab screenshot --full body "$OUT_DIR/03-after-enter.png"

ab find label "USB generation marking" fill "USB 3.2 Gen 1"
ab wait --text "USB 3.2 Gen 1 (5Gbps)"
ab find label "Printed wattage" fill "60, 100, 240W"
ab wait --text "240W"
ab screenshot --full body "$OUT_DIR/04-wattage-edit.png"

if [[ "$LOCAL_ONLY" != "1" ]]; then
  ab find role button click --name "Reset" --exact
  ab wait --fn "document.querySelector('textarea')?.value === ''"
else
  # No backend exists in the local shell check; don't claim inference/reset proof.
  ab find role button click --name "Catalog" --exact
  ab wait --text "Catalog Results"
  ab find role button click --name "Manual entry" --exact
  ab wait --text "USB 3.2 Gen 1 (5Gbps)"
fi
ab screenshot --full body "$OUT_DIR/05-after-reset.png"

ab_json snapshot -i >"$OUT_DIR/final-snapshot.json"
ab_json errors >"$OUT_DIR/errors.json"
ab_json console >"$OUT_DIR/console.json"
ab_json get title >"$OUT_DIR/title.json"
# Never persist Vercel bypass query parameters in downloadable artifacts.
ab_json eval "location.origin + location.pathname" >"$OUT_DIR/url.json"
jq -e '.data.errors | length == 0' "$OUT_DIR/errors.json" >/dev/null
jq -e '[.data.messages[] | select(.type == "error")] | length == 0' "$OUT_DIR/console.json" >/dev/null
SAFE_BASE_URL="$(node -e 'const u = new URL(process.argv[1]); console.log(u.origin + u.pathname)' "$BASE_URL")"

jq -n \
  --arg baseUrl "$SAFE_BASE_URL" \
  --arg outDir "$OUT_DIR" \
  --arg sessionName "$SESSION_NAME" \
  --arg localOnly "$LOCAL_ONLY" \
  --arg browserbaseSessionId "$BB_SESSION_ID" \
  --arg browserbaseReplayUrl "$BB_REPLAY_URL" \
  '{
    baseUrl: $baseUrl,
    scope: (if $localOnly == "1" then "local manual fields; inference/reset not run" else "hosted inference and reset" end),
    outputDirectory: $outDir,
    sessionName: $sessionName,
    browserbaseSessionId: (if $browserbaseSessionId == "" then null else $browserbaseSessionId end),
    browserbaseReplayUrl: (if $browserbaseReplayUrl == "" then null else $browserbaseReplayUrl end),
    screenshots: [
      "01-home.png",
      "02-manual-entry.png",
      "03-after-enter.png",
      "04-wattage-edit.png",
      "05-after-reset.png"
    ]
  }' >"$OUT_DIR/results.json"

cat >"$OUT_DIR/summary.md" <<EOF
# Browser QA

- Base URL: ${SAFE_BASE_URL}
- Output directory: ${OUT_DIR}
- Session: ${SESSION_NAME}
$(if [[ -n "$BB_REPLAY_URL" ]]; then echo "- Browserbase replay: ${BB_REPLAY_URL}"; fi)

## Screenshots
- 01-home.png
- 02-manual-entry.png
- 03-after-enter.png
- 04-wattage-edit.png
- 05-after-reset.png
EOF

echo "Browser QA complete."
echo "Results: $OUT_DIR/results.json"
if [[ -n "$BB_REPLAY_URL" ]]; then
  echo "Browserbase replay: $BB_REPLAY_URL"
fi

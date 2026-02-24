#!/usr/bin/env bash

set -euo pipefail

PORT="4173"
HOST="127.0.0.1"
BASE_URL=""
OUT_DIR="artifacts/browser-qa"
START_PREVIEW="1"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)
      PORT="$2"
      shift 2
      ;;
    --host)
      HOST="$2"
      shift 2
      ;;
    --base-url)
      BASE_URL="$2"
      shift 2
      ;;
    --external-url)
      BASE_URL="$2"
      START_PREVIEW="0"
      shift 2
      ;;
    --out-dir)
      OUT_DIR="$2"
      shift 2
      ;;
    --no-preview)
      START_PREVIEW="0"
      shift 1
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$BASE_URL" ]]; then
  BASE_URL="http://${HOST}:${PORT}"
fi

is_local_base_url() {
  local url="$1"
  [[ "$url" =~ ^https?://(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|/|$) ]]
}

PREVIEW_PID=""

cleanup() {
  if [[ -n "$PREVIEW_PID" ]]; then
    kill "$PREVIEW_PID" >/dev/null 2>&1 || true
    wait "$PREVIEW_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

wait_for_url() {
  local url="$1"
  local attempts=0
  local max_attempts=90
  until curl -fsS "$url" >/dev/null 2>&1; do
    attempts=$((attempts + 1))
    if [[ "$attempts" -ge "$max_attempts" ]]; then
      echo "Timed out waiting for ${url}" >&2
      exit 1
    fi
    sleep 1
  done
}

if [[ "$START_PREVIEW" == "1" ]]; then
  export PUBLIC_CONVEX_URL="${PUBLIC_CONVEX_URL:-https://example.convex.cloud}"
  (
    cd apps/web
    bun run build
  )
  (
    cd apps/web
    bunx vite preview --host "$HOST" --port "$PORT"
  ) >/tmp/cable-intel-web-preview.log 2>&1 &
  PREVIEW_PID="$!"
  wait_for_url "$BASE_URL"
fi

SMOKE_ARGS=(
  --base-url "$BASE_URL"
  --out-dir "$OUT_DIR"
)
if [[ "${USE_BROWSERBASE:-0}" == "1" ]]; then
  if is_local_base_url "$BASE_URL"; then
    echo "USE_BROWSERBASE=1 ignored for local URL (${BASE_URL}); using local provider."
  else
    SMOKE_ARGS+=(--use-browserbase)
  fi
fi

bash ./scripts/browser/agent-browser-smoke.sh "${SMOKE_ARGS[@]}"

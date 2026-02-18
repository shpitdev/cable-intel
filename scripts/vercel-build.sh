#!/usr/bin/env bash
set -euo pipefail

if [[ -n "${CONVEX_DEPLOY_KEY:-}" || (-n "${CONVEX_SELF_HOSTED_URL:-}" && -n "${CONVEX_SELF_HOSTED_ADMIN_KEY:-}") ]]; then
  cd packages/backend
  bun x convex deploy --cmd-url-env-var-name PUBLIC_CONVEX_URL --cmd "cd ../.. && turbo run build"
  exit 0
fi

if [[ -n "${CONVEX_URL:-}" && -z "${PUBLIC_CONVEX_URL:-}" ]]; then
  export PUBLIC_CONVEX_URL="${CONVEX_URL}"
  echo "Using CONVEX_URL as PUBLIC_CONVEX_URL for the build."
fi

if [[ -z "${PUBLIC_CONVEX_URL:-}" ]]; then
  echo "Warning: PUBLIC_CONVEX_URL is not set. Configure CONVEX_DEPLOY_KEY for dynamic Convex URL injection."
fi

turbo run build

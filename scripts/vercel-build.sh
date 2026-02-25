#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Derive a deterministic preview deployment name so we reuse a bounded pool of Convex
# previews and avoid hitting the 40-deployment quota on busy repos.
derive_preview_slot_name() {
  if [[ "${CONVEX_DISABLE_PREVIEW_SLOT_POOL:-}" == "1" ]]; then
    return
  fi
  if [[ "${VERCEL_ENV:-}" != "preview" ]]; then
    return
  fi
  local pr_id="${VERCEL_GIT_PULL_REQUEST_ID:-}"
  if [[ -z "${pr_id}" || ! "${pr_id}" =~ ^[0-9]+$ ]]; then
    return
  fi
  local pool_size_value="${CONVEX_PREVIEW_SLOT_COUNT:-32}"
  if [[ -z "${pool_size_value}" || ! "${pool_size_value}" =~ ^[0-9]+$ ]]; then
    echo "Invalid CONVEX_PREVIEW_SLOT_COUNT: ${pool_size_value}" >&2
    return 1
  fi
  local pool_size="${pool_size_value}"
  if (( pool_size <= 0 )); then
    echo "CONVEX_PREVIEW_SLOT_COUNT must be greater than zero." >&2
    return 1
  fi
  local slot=$(( pr_id % pool_size ))
  printf "vercel-pr-slot-%02d" "${slot}"
}

if [[ -n "${CONVEX_DEPLOY_KEY:-}" || (-n "${CONVEX_SELF_HOSTED_URL:-}" && -n "${CONVEX_SELF_HOSTED_ADMIN_KEY:-}") ]]; then
  cd "${REPO_ROOT}/packages/backend"
  preview_slot_name=""
  preview_slot_name="$(derive_preview_slot_name)"
  if [[ -n "${preview_slot_name}" ]]; then
    echo "Using Convex preview slot '${preview_slot_name}' (pool size ${CONVEX_PREVIEW_SLOT_COUNT:-32})."
  fi
  deploy_args=(
    x
    convex
    deploy
    --cmd-url-env-var-name
    PUBLIC_CONVEX_URL
    --cmd
    "cd ../.. && turbo run build"
  )
  if [[ -n "${preview_slot_name}" ]]; then
    deploy_args+=(--preview-create "${preview_slot_name}")
  fi
  bun "${deploy_args[@]}"
  exit 0
fi

if [[ -n "${CONVEX_URL:-}" && -z "${PUBLIC_CONVEX_URL:-}" ]]; then
  export PUBLIC_CONVEX_URL="${CONVEX_URL}"
  echo "Using CONVEX_URL as PUBLIC_CONVEX_URL for the build."
fi

if [[ -z "${PUBLIC_CONVEX_URL:-}" ]]; then
  echo "PUBLIC_CONVEX_URL is required when CONVEX deploy credentials are not configured." >&2
  exit 1
fi

cd "${REPO_ROOT}"
turbo run build

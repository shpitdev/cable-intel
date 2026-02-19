#!/usr/bin/env python3
"""Bulk delete Convex deployments with safe defaults."""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import re
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any

API_BASE = "https://api.convex.dev"
CLIENT_HEADER = "codex-convex-delete-deployments/1.0"


@dataclass(frozen=True)
class Deployment:
    name: str
    deployment_type: str
    region: str | None
    is_default: bool


class ConvexApiError(RuntimeError):
    pass


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="List and bulk-delete Convex deployments.",
    )
    parser.add_argument("--team", help="Convex team slug (required if CONVEX_TEAM is unset)")
    parser.add_argument(
        "--project",
        help="Convex project slug (required if CONVEX_PROJECT is unset)",
    )
    parser.add_argument(
        "--token",
        help="Convex access token (defaults to CONVEX_ACCESS_TOKEN or ~/.convex/config.json)",
    )
    parser.add_argument(
        "--type",
        dest="types",
        action="append",
        default=None,
        help="Deployment type to target (repeatable). Defaults to preview.",
    )
    parser.add_argument(
        "--name",
        action="append",
        default=[],
        help="Only delete exact deployment names (repeatable).",
    )
    parser.add_argument(
        "--match",
        help="Only delete deployments matching this regex against deployment name.",
    )
    parser.add_argument(
        "--exclude",
        action="append",
        default=[],
        help="Exclude exact deployment names from deletion (repeatable).",
    )
    parser.add_argument(
        "--include-dev",
        action="store_true",
        help="Allow deleting dev deployments when --type includes dev.",
    )
    parser.add_argument(
        "--include-prod",
        action="store_true",
        help="Allow deleting prod deployments when --type includes prod.",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Execute deletes. Without this flag, the script performs a dry-run.",
    )
    parser.add_argument(
        "--yes",
        action="store_true",
        help="Skip interactive confirmation when --apply is set.",
    )

    args = parser.parse_args()
    args.team = args.team or os.getenv("CONVEX_TEAM")
    args.project = args.project or os.getenv("CONVEX_PROJECT")

    if not args.team or not args.project:
        parser.error("Provide --team and --project (or set CONVEX_TEAM / CONVEX_PROJECT).")

    if args.yes and not args.apply:
        parser.error("--yes only makes sense with --apply.")

    args.types = normalize_types(args.types)
    return args


def normalize_types(raw_types: list[str] | None) -> set[str]:
    if not raw_types:
        return {"preview"}

    allowed = {"preview", "dev", "prod"}
    normalized: set[str] = set()
    for raw_type in raw_types:
        deployment_type = raw_type.strip().lower()
        if deployment_type not in allowed:
            allowed_display = ", ".join(sorted(allowed))
            raise SystemExit(
                f"Invalid --type value '{raw_type}'. Allowed values: {allowed_display}."
            )
        normalized.add(deployment_type)
    return normalized


def load_token(cli_token: str | None) -> str:
    if cli_token:
        return cli_token

    env_token = os.getenv("CONVEX_ACCESS_TOKEN")
    if env_token:
        return env_token

    config_path = pathlib.Path.home() / ".convex" / "config.json"
    if not config_path.exists():
        raise SystemExit(
            "No Convex token found. Pass --token, set CONVEX_ACCESS_TOKEN, or run `bun x convex dev` once."
        )

    try:
        config = json.loads(config_path.read_text())
    except json.JSONDecodeError as error:
        raise SystemExit(f"Invalid JSON in {config_path}: {error}") from error

    token = config.get("accessToken")
    if not token or not isinstance(token, str):
        raise SystemExit(
            f"Could not find 'accessToken' in {config_path}. Re-auth with `bun x convex dev`."
        )

    return token


def api_request(
    *,
    method: str,
    path: str,
    token: str,
    payload: dict[str, Any] | None = None,
) -> Any:
    body: bytes | None = None
    headers = {
        "Authorization": f"Bearer {token}",
        "Convex-Client": CLIENT_HEADER,
    }
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"

    request = urllib.request.Request(
        url=f"{API_BASE}{path}",
        method=method,
        data=body,
        headers=headers,
    )

    try:
        with urllib.request.urlopen(request) as response:
            raw_response = response.read().decode("utf-8")
    except urllib.error.HTTPError as error:
        details = error.read().decode("utf-8", errors="replace")
        raise ConvexApiError(
            f"{method} {path} failed with {error.code}: {details.strip() or error.reason}"
        ) from error
    except urllib.error.URLError as error:
        raise ConvexApiError(f"{method} {path} failed: {error.reason}") from error

    if not raw_response.strip():
        return None

    try:
        return json.loads(raw_response)
    except json.JSONDecodeError:
        return raw_response


def list_deployments(team: str, project: str, token: str) -> list[Deployment]:
    data = api_request(
        method="GET",
        path=f"/api/teams/{team}/projects/{project}/deployments",
        token=token,
    )

    if not isinstance(data, list):
        raise ConvexApiError("Unexpected response when listing deployments.")

    deployments: list[Deployment] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        name = item.get("name")
        deployment_type = item.get("deploymentType")
        if not isinstance(name, str) or not isinstance(deployment_type, str):
            continue
        deployments.append(
            Deployment(
                name=name,
                deployment_type=deployment_type,
                region=item.get("region") if isinstance(item.get("region"), str) else None,
                is_default=bool(item.get("isDefault")),
            )
        )

    return deployments


def should_keep(
    deployment: Deployment,
    *,
    target_types: set[str],
    names_filter: set[str],
    exclude_filter: set[str],
    name_pattern: re.Pattern[str] | None,
    include_dev: bool,
    include_prod: bool,
) -> bool:
    if deployment.deployment_type not in target_types:
        return True

    if names_filter and deployment.name not in names_filter:
        return True

    if deployment.name in exclude_filter:
        return True

    if name_pattern and not name_pattern.search(deployment.name):
        return True

    if deployment.deployment_type == "prod" and not include_prod:
        return True

    if deployment.deployment_type == "dev" and not include_dev:
        return True

    return False


def render_table(deployments: list[Deployment]) -> str:
    if not deployments:
        return "(none)"

    rows = [(d.name, d.deployment_type, d.region or "-", "yes" if d.is_default else "no") for d in deployments]
    widths = [
        max(len("name"), *(len(row[0]) for row in rows)),
        max(len("type"), *(len(row[1]) for row in rows)),
        max(len("region"), *(len(row[2]) for row in rows)),
        len("default"),
    ]

    header = f"{'name':<{widths[0]}}  {'type':<{widths[1]}}  {'region':<{widths[2]}}  default"
    separator = f"{'-' * widths[0]}  {'-' * widths[1]}  {'-' * widths[2]}  {'-' * len('default')}"
    lines = [header, separator]
    for row in rows:
        lines.append(f"{row[0]:<{widths[0]}}  {row[1]:<{widths[1]}}  {row[2]:<{widths[2]}}  {row[3]}")
    return "\n".join(lines)


def delete_deployment(name: str, token: str) -> None:
    api_request(
        method="POST",
        path=f"/v1/deployments/{name}/delete",
        token=token,
        payload={},
    )


def confirm_or_exit(target_count: int) -> None:
    prompt = (
        f"About to delete {target_count} deployment(s). Type DELETE to continue: "
    )
    response = input(prompt).strip()
    if response != "DELETE":
        raise SystemExit("Confirmation text did not match. Aborting.")


def main() -> int:
    args = parse_args()
    token = load_token(args.token)

    try:
        deployments = list_deployments(args.team, args.project, token)
    except ConvexApiError as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1

    names_filter = {name.strip() for name in args.name if name.strip()}
    exclude_filter = {name.strip() for name in args.exclude if name.strip()}
    name_pattern = re.compile(args.match) if args.match else None

    delete_candidates = [
        deployment
        for deployment in deployments
        if not should_keep(
            deployment,
            target_types=args.types,
            names_filter=names_filter,
            exclude_filter=exclude_filter,
            name_pattern=name_pattern,
            include_dev=args.include_dev,
            include_prod=args.include_prod,
        )
    ]

    mode = "APPLY" if args.apply else "DRY-RUN"
    print(f"Mode: {mode}")
    print(f"Team/Project: {args.team}/{args.project}")
    print(f"Total deployments in project: {len(deployments)}")
    print(f"Delete candidates: {len(delete_candidates)}")
    print(render_table(delete_candidates))

    if not args.apply:
        print("\nDry-run only. Re-run with --apply to execute deletions.")
        return 0

    if not delete_candidates:
        print("\nNothing to delete.")
        return 0

    if not args.yes:
        confirm_or_exit(len(delete_candidates))

    failed: list[tuple[str, str]] = []
    for deployment in delete_candidates:
        try:
            delete_deployment(deployment.name, token)
            print(f"deleted: {deployment.name}")
        except ConvexApiError as error:
            failed.append((deployment.name, str(error)))
            print(f"failed: {deployment.name}")

    if failed:
        print("\nSome deletions failed:", file=sys.stderr)
        for name, message in failed:
            print(f"- {name}: {message}", file=sys.stderr)
        return 1

    print("\nAll selected deployments deleted successfully.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

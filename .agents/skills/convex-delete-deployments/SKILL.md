---
name: convex-delete-deployments
description: Bulk deletion workflow for Convex deployments with safe defaults and explicit confirmation. Use when Convex preview environments accumulate, deployment quota is exhausted, or you need to clean up many deployments quickly by type/name filter without deleting prod/dev accidentally.
---

# Convex Delete Deployments

Use this skill to list and bulk-delete Convex deployments via the Convex management API.

## Workflow

1. Run dry-run first.
2. Review candidates.
3. Re-run with `--apply` after confirmation.

## Command

```bash
python3 .agents/skills/convex-delete-deployments/scripts/delete_deployments.py \
  --team <team-slug> \
  --project <project-slug>
```

Default behavior is safe:
- Dry-run only unless `--apply` is passed.
- Targets only `preview` deployments unless `--type` is provided.
- Never deletes `dev` or `prod` unless explicitly allowed.

## Common Usage

Delete all preview deployments (recommended flow):

```bash
python3 .agents/skills/convex-delete-deployments/scripts/delete_deployments.py \
  --team <team-slug> \
  --project <project-slug>

python3 .agents/skills/convex-delete-deployments/scripts/delete_deployments.py \
  --team <team-slug> \
  --project <project-slug> \
  --apply
```

Delete only specific names:

```bash
python3 .agents/skills/convex-delete-deployments/scripts/delete_deployments.py \
  --team <team-slug> \
  --project <project-slug> \
  --name foo-preview-1 \
  --name foo-preview-2 \
  --apply --yes
```

Regex filter and exclusions:

```bash
python3 .agents/skills/convex-delete-deployments/scripts/delete_deployments.py \
  --team <team-slug> \
  --project <project-slug> \
  --match '^feature-' \
  --exclude feature-keep-me
```

## Safety Rules

- Keep `--type preview` as default for routine cleanup.
- Use `--include-dev` only when intentionally rotating dev deployments.
- Use `--include-prod` only for explicit teardown workflows.
- Always inspect dry-run output before `--apply --yes`.

## Inputs

Token resolution order:
1. `--token`
2. `CONVEX_ACCESS_TOKEN`
3. `~/.convex/config.json` (`accessToken`)

Team/project resolution order:
1. `--team` / `--project`
2. `CONVEX_TEAM` / `CONVEX_PROJECT`

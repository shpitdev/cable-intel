#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

interface CliOptions {
  backendDir: string;
  batchSize: number;
  deploymentName: string;
  dryRun: boolean;
  maxSeedUrls: number;
  perTemplate: number;
  templates: string[];
}

interface RunSeedIngestResult {
  completedItems: number;
  failedItems: number;
  status: string;
  totalItems: number;
  workflowRunId: string;
}

interface CatalogRow {
  brand?: string;
  connectorFrom?: string;
  connectorTo?: string;
  qualityState?: "needs_enrichment" | "ready";
}

interface QueueSummary {
  failed: number;
  inProgress: number;
  pending: number;
}

const DEFAULT_TEMPLATES = [
  "anker-us",
  "satechi",
  "native-union",
  "mous",
  "baseus",
  "ugreen",
] as const;
const DEFAULT_PER_TEMPLATE = 12;
const DEFAULT_MAX_SEED_URLS = 60;
const DEFAULT_BATCH_SIZE = 12;
const JSON_START_REGEX = /[{[]/;

const printUsage = (): void => {
  console.log(
    [
      "Usage:",
      "  bun run scripts/seed-realistic-catalog.ts --deployment-name <name> [options]",
      "",
      "Options:",
      "  --deployment-name <name>   Convex deployment name (required)",
      `  --templates <ids>          Comma-separated template IDs (default: ${DEFAULT_TEMPLATES.join(",")})`,
      `  --per-template <n>         URLs to discover per template (default: ${DEFAULT_PER_TEMPLATE})`,
      `  --max-seed-urls <n>        Max URLs to ingest total (default: ${DEFAULT_MAX_SEED_URLS})`,
      `  --batch-size <n>           URLs per ingest batch (default: ${DEFAULT_BATCH_SIZE})`,
      "  --backend-dir <path>       Backend package dir (default: packages/backend)",
      "  --dry-run                  Discover URLs and print plan without ingest",
      "  --help                     Show this message",
    ].join("\n")
  );
};

const parsePositiveInt = (value: string, flag: string): number => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid value for ${flag}: ${value}`);
  }
  return parsed;
};

const parseTemplates = (value: string): string[] => {
  const templates = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (templates.length === 0) {
    throw new Error("At least one template ID is required.");
  }

  return [...new Set(templates)];
};

const parseArgs = (argv: string[]): CliOptions => {
  const options: CliOptions = {
    deploymentName: "",
    templates: [...DEFAULT_TEMPLATES],
    perTemplate: DEFAULT_PER_TEMPLATE,
    maxSeedUrls: DEFAULT_MAX_SEED_URLS,
    batchSize: DEFAULT_BATCH_SIZE,
    backendDir: "packages/backend",
    dryRun: false,
  };

  const valueHandlers: Record<
    string,
    (value: string, nextOptions: CliOptions) => void
  > = {
    "--deployment-name": (value, nextOptions) => {
      nextOptions.deploymentName = value.trim();
    },
    "--templates": (value, nextOptions) => {
      nextOptions.templates = parseTemplates(value);
    },
    "--per-template": (value, nextOptions) => {
      nextOptions.perTemplate = parsePositiveInt(value, "--per-template");
    },
    "--max-seed-urls": (value, nextOptions) => {
      nextOptions.maxSeedUrls = parsePositiveInt(value, "--max-seed-urls");
    },
    "--batch-size": (value, nextOptions) => {
      nextOptions.batchSize = parsePositiveInt(value, "--batch-size");
    },
    "--backend-dir": (value, nextOptions) => {
      nextOptions.backendDir = value.trim();
    },
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) {
      continue;
    }

    if (arg === "--help") {
      printUsage();
      process.exit(0);
    }

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    const handler = valueHandlers[arg];
    if (!handler) {
      throw new Error(`Unknown option: ${arg}`);
    }

    const next = argv[index + 1];
    if (!next) {
      throw new Error(`Missing value for ${arg}`);
    }

    handler(next, options);
    index += 1;
  }

  if (!options.deploymentName) {
    throw new Error("Missing required option: --deployment-name");
  }
  if (options.batchSize > options.maxSeedUrls) {
    options.batchSize = options.maxSeedUrls;
  }

  return options;
};

const runCommand = (command: string, args: string[], cwd: string): string => {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["inherit", "pipe", "pipe"],
    env: process.env,
  });

  if (result.status !== 0) {
    throw new Error(
      [
        `Command failed: ${command} ${args.join(" ")}`,
        result.stdout?.trim() ? `stdout:\n${result.stdout.trim()}` : "",
        result.stderr?.trim() ? `stderr:\n${result.stderr.trim()}` : "",
      ]
        .filter(Boolean)
        .join("\n\n")
    );
  }

  return (result.stdout ?? "").trim();
};

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: JSON scanning uses explicit depth/string tracking.
const findBalancedJsonSlice = (text: string, start: number): string | null => {
  const opener = text[start];
  if (!(opener === "{" || opener === "[")) {
    return null;
  }

  const closer = opener === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (!char) {
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === opener) {
      depth += 1;
      continue;
    }
    if (char === closer) {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return null;
};

const parseJsonOutput = <T>(output: string, context: string): T => {
  const trimmed = output.trim();
  if (!trimmed) {
    throw new Error(`No JSON output returned for ${context}`);
  }

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    // Fall back to extracting a JSON object/array from mixed CLI output.
  }

  const startMatch = trimmed.match(JSON_START_REGEX);
  const startIndex = startMatch?.index;
  if (startIndex === undefined) {
    throw new Error(
      `Could not find JSON in output for ${context}:\n${trimmed}`
    );
  }

  const jsonSlice = findBalancedJsonSlice(trimmed, startIndex);
  if (!jsonSlice) {
    throw new Error(
      `Could not parse JSON fragment in output for ${context}:\n${trimmed}`
    );
  }

  return JSON.parse(jsonSlice) as T;
};

const runConvex = <T>(
  options: CliOptions,
  functionName: string,
  args: Record<string, unknown>
): T => {
  const output = runCommand(
    "bunx",
    [
      "convex",
      "run",
      "--deployment-name",
      options.deploymentName,
      functionName,
      JSON.stringify(args),
    ],
    options.backendDir
  );
  return parseJsonOutput<T>(output, functionName);
};

const normalizeUrl = (value: string): string => {
  const parsed = new URL(value);
  parsed.hash = "";
  const normalized = parsed.toString();
  return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
};

const chunk = <T>(items: T[], size: number): T[][] => {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }
  return groups;
};

const sortedCounts = (
  values: string[],
  maxEntries = 8
): Array<{ key: string; value: number }> => {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, value]) => ({ key, value }))
    .sort((left, right) => {
      if (left.value !== right.value) {
        return right.value - left.value;
      }
      return left.key.localeCompare(right.key);
    })
    .slice(0, maxEntries);
};

const main = (): void => {
  const options = parseArgs(process.argv.slice(2));
  options.backendDir = resolve(options.backendDir);

  console.log(`Deployment: ${options.deploymentName}`);
  console.log(`Templates: ${options.templates.join(", ")}`);
  console.log(
    `Discovery: up to ${options.perTemplate} URLs/template (max total ${options.maxSeedUrls})`
  );
  console.log(`Batch size: ${options.batchSize}`);
  if (options.dryRun) {
    console.log("Mode: dry-run (discovery only)");
  }
  console.log("");

  const discoveredByTemplate = new Map<string, string[]>();
  for (const templateId of options.templates) {
    try {
      const discovered = runConvex<string[]>(
        options,
        "ingest:discoverShopifySeedUrls",
        {
          templateId,
          maxItems: options.perTemplate,
        }
      );
      const normalized = [...new Set(discovered.map(normalizeUrl))];
      discoveredByTemplate.set(templateId, normalized);
      console.log(`${templateId}: discovered ${normalized.length} URL(s)`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`${templateId}: discovery failed (${message})`);
    }
  }

  const orderedUrls: string[] = [];
  const seen = new Set<string>();
  for (const templateId of options.templates) {
    const urls = discoveredByTemplate.get(templateId) ?? [];
    for (const url of urls) {
      if (seen.has(url)) {
        continue;
      }
      seen.add(url);
      orderedUrls.push(url);
    }
  }

  const seedUrls = orderedUrls.slice(0, options.maxSeedUrls);
  if (seedUrls.length === 0) {
    throw new Error("No URLs discovered. Nothing to seed.");
  }

  console.log(`\nPlanned seed URLs: ${seedUrls.length}`);
  for (const [index, url] of seedUrls.entries()) {
    console.log(`${String(index + 1).padStart(2, " ")}. ${url}`);
  }

  if (options.dryRun) {
    return;
  }

  let attemptedItems = 0;
  let completedItems = 0;
  let failedItems = 0;
  const workflowRunIds: string[] = [];
  const batches = chunk(seedUrls, options.batchSize);

  for (const [index, batch] of batches.entries()) {
    console.log(
      `\nSeeding batch ${index + 1}/${batches.length} (${batch.length} URLs)...`
    );
    const result = runConvex<RunSeedIngestResult>(
      options,
      "ingest:runSeedIngest",
      {
        seedUrls: batch,
        maxItems: batch.length,
      }
    );
    attemptedItems += result.totalItems;
    completedItems += result.completedItems;
    failedItems += result.failedItems;
    workflowRunIds.push(result.workflowRunId);
    console.log(
      `  workflow=${result.workflowRunId} completed=${result.completedItems} failed=${result.failedItems}`
    );
  }

  const catalogRows = runConvex<CatalogRow[]>(
    options,
    "ingestQueries:getTopCables",
    {
      limit: Math.max(seedUrls.length * 4, 120),
      includeStates: ["ready", "needs_enrichment"],
    }
  );
  const queueSummary = runConvex<QueueSummary>(
    options,
    "ingestQueries:getEnrichmentQueueSummary",
    {}
  );

  const readyCount = catalogRows.filter(
    (row) => row.qualityState === "ready"
  ).length;
  const needsEnrichmentCount = catalogRows.filter(
    (row) => row.qualityState === "needs_enrichment"
  ).length;
  const brands = sortedCounts(
    catalogRows.map((row) => row.brand?.trim() || "Unknown")
  );
  const connectorPairs = sortedCounts(
    catalogRows.map((row) => {
      const from = row.connectorFrom?.trim() || "Unknown";
      const to = row.connectorTo?.trim() || "Unknown";
      return `${from} -> ${to}`;
    })
  );

  console.log("\nSeed summary");
  console.log(`- URLs attempted: ${attemptedItems}`);
  console.log(`- Completed items: ${completedItems}`);
  console.log(`- Failed items: ${failedItems}`);
  console.log(`- Workflows: ${workflowRunIds.join(", ")}`);
  console.log(
    `- Catalog rows sampled: ${catalogRows.length} (ready=${readyCount}, needs_enrichment=${needsEnrichmentCount})`
  );
  console.log(
    `- Enrichment queue: pending=${queueSummary.pending}, inProgress=${queueSummary.inProgress}, failed=${queueSummary.failed}`
  );

  console.log("\nTop brands");
  for (const entry of brands) {
    console.log(`- ${entry.key}: ${entry.value}`);
  }

  console.log("\nConnector distribution");
  for (const entry of connectorPairs) {
    console.log(`- ${entry.key}: ${entry.value}`);
  }
};

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\nseed-realistic-catalog failed: ${message}`);
  process.exit(1);
}

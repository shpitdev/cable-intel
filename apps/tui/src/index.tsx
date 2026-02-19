import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";

interface CliOptions {
  allowedDomain: string | null;
  deploymentName: string | null;
  discoverMax: number;
  reportOnly: boolean;
  seedMax: number;
  templateId: string;
  vercelUrl: string | null;
  yes: boolean;
}

interface CatalogRow {
  brand?: string;
  connectorFrom?: string;
  connectorTo?: string;
  evidenceRefs?: unknown[];
  imageUrls?: string[];
  model?: string;
  power?: {
    maxWatts?: number;
  };
  productUrl?: string;
  qualityIssues?: string[];
  qualityState?: "needs_enrichment" | "ready";
  sku?: string;
  variant?: string;
}

const DEFAULT_TEMPLATE_ID = "anker-us";
const DEFAULT_DISCOVER_MAX = 30;
const DEFAULT_SEED_MAX = 20;
const DEFAULT_ALLOWED_DOMAIN = "anker.com";
const APP_ENTRY_REGEX = /_app\/immutable\/entry\/app\.[^"' )]+\.js/;
const NODE_ZERO_REGEX = /\.\.\/nodes\/0\.[^"' )]+\.js/;
const DOT_SLASH_PREFIX_REGEX = /^\.?\//;
const DOT_DOT_SLASH_PREFIX_REGEX = /^\.\.\//;
const CONVEX_URL_REGEX = /https:\/\/[a-z0-9-]+\.convex\.cloud/i;

const print = (value: string): void => {
  output.write(`${value}\n`);
};

const printUsage = (): void => {
  print("Cable Intel ingest TUI");
  print("");
  print("Usage:");
  print("  bun run src/index.tsx [options]");
  print("");
  print("Options:");
  print("  --vercel-url <url>        Resolve deployment from Vercel URL");
  print("  --deployment-name <name>  Convex deployment name");
  print("  --report-only             Skip ingest, only run quality report");
  print(
    `  --template-id <id>        Template id (default: ${DEFAULT_TEMPLATE_ID})`
  );
  print(
    `  --discover-max <n>        URLs to discover before seed (default: ${DEFAULT_DISCOVER_MAX})`
  );
  print(
    `  --seed-max <n>            URLs to seed (default: ${DEFAULT_SEED_MAX})`
  );
  print(
    `  --allowed-domain <host>   Allowed domain filter (default: ${DEFAULT_ALLOWED_DOMAIN})`
  );
  print("  --yes                     Non-interactive mode");
  print("  --help                    Show this help");
};

const parsePositiveInt = (value: string, flag: string): number => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid value for ${flag}: ${value}`);
  }
  return parsed;
};

const normalizeVercelUrl = (raw: string): string => {
  const value = raw.trim();
  if (!value) {
    throw new Error("Empty Vercel URL");
  }
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }
  return `https://${value}`;
};

const parseArgs = (argv: string[]): CliOptions => {
  const options: CliOptions = {
    vercelUrl: null,
    deploymentName: null,
    templateId: DEFAULT_TEMPLATE_ID,
    discoverMax: DEFAULT_DISCOVER_MAX,
    seedMax: DEFAULT_SEED_MAX,
    allowedDomain: DEFAULT_ALLOWED_DOMAIN,
    reportOnly: false,
    yes: false,
  };

  const handlers: Record<string, (value: string) => void> = {
    "--vercel-url": (value) => {
      options.vercelUrl = normalizeVercelUrl(value);
    },
    "--deployment-name": (value) => {
      options.deploymentName = value.trim();
    },
    "--template-id": (value) => {
      options.templateId = value.trim();
    },
    "--discover-max": (value) => {
      options.discoverMax = parsePositiveInt(value, "--discover-max");
    },
    "--seed-max": (value) => {
      options.seedMax = parsePositiveInt(value, "--seed-max");
    },
    "--allowed-domain": (value) => {
      const trimmed = value.trim();
      options.allowedDomain = trimmed || null;
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
    if (arg === "--report-only") {
      options.reportOnly = true;
      continue;
    }
    if (arg === "--yes") {
      options.yes = true;
      continue;
    }

    const handler = handlers[arg];
    if (!handler) {
      throw new Error(`Unknown option: ${arg}`);
    }

    const next = argv[index + 1];
    if (!next) {
      throw new Error(`Missing value for ${arg}`);
    }

    handler(next);
    index += 1;
  }

  return options;
};

const fetchText = async (url: string): Promise<string> => {
  const response = await fetch(url, {
    headers: {
      "user-agent": "cable-intel-tui/1.0",
    },
  });
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }
  return await response.text();
};

const extractAppEntryPath = (html: string): string => {
  const match = html.match(APP_ENTRY_REGEX);
  if (!match?.[0]) {
    throw new Error("Unable to find app entry chunk in deployment HTML.");
  }
  return `/${match[0].replace(DOT_SLASH_PREFIX_REGEX, "")}`;
};

const extractNodeZeroPath = (appCode: string): string => {
  const match = appCode.match(NODE_ZERO_REGEX);
  if (!match?.[0]) {
    throw new Error("Unable to find node 0 chunk in app entry bundle.");
  }
  const normalized = match[0].replace(DOT_DOT_SLASH_PREFIX_REGEX, "");
  return `/_app/immutable/${normalized}`;
};

const resolveDeploymentFromVercelUrl = async (
  vercelUrl: string
): Promise<{ convexUrl: string; deploymentName: string }> => {
  const html = await fetchText(vercelUrl);
  const appEntryPath = extractAppEntryPath(html);
  const appCode = await fetchText(new URL(appEntryPath, vercelUrl).toString());
  const nodeZeroPath = extractNodeZeroPath(appCode);
  const nodeCode = await fetchText(new URL(nodeZeroPath, vercelUrl).toString());
  const match = nodeCode.match(CONVEX_URL_REGEX);
  if (!match?.[0]) {
    throw new Error("Unable to find Convex URL in node bundle.");
  }

  const convexUrl = match[0];
  const deploymentName = new URL(convexUrl).hostname.split(".")[0];
  if (!deploymentName) {
    throw new Error(`Could not parse deployment name from ${convexUrl}`);
  }

  return { convexUrl, deploymentName };
};

const findRepoRoot = (startDir: string): string => {
  let cursor = resolve(startDir);
  while (true) {
    const backendPackageJson = join(
      cursor,
      "packages",
      "backend",
      "package.json"
    );
    if (existsSync(backendPackageJson)) {
      return cursor;
    }
    const parent = dirname(cursor);
    if (parent === cursor) {
      throw new Error(
        "Could not locate repo root containing packages/backend."
      );
    }
    cursor = parent;
  }
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

function parseJsonOutput<T>(raw: string): T {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Expected JSON output but command returned empty output.");
  }

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const firstArray = trimmed.indexOf("[");
    const firstObject = trimmed.indexOf("{");
    const firstIndexCandidates = [firstArray, firstObject].filter(
      (index) => index >= 0
    );
    const firstIndex = Math.min(...firstIndexCandidates);
    const opensWithArray = trimmed[firstIndex] === "[";
    const lastIndex = opensWithArray
      ? trimmed.lastIndexOf("]")
      : trimmed.lastIndexOf("}");
    if (firstIndex < 0 || lastIndex < firstIndex) {
      throw new Error(`Failed to parse command output as JSON:\n${trimmed}`);
    }
    return JSON.parse(trimmed.slice(firstIndex, lastIndex + 1)) as T;
  }
}

function runConvex<T>(
  functionName: string,
  deploymentName: string,
  args: unknown,
  backendDir: string
): T {
  const raw = runCommand(
    "bun",
    [
      "x",
      "convex",
      "run",
      functionName,
      "--deployment-name",
      deploymentName,
      JSON.stringify(args),
    ],
    backendDir
  );
  return parseJsonOutput<T>(raw);
}

const isBlank = (value: string | undefined): boolean => {
  return !value || value.trim().length === 0;
};

const analyzeRows = (rows: readonly CatalogRow[]) => {
  const readyRows = rows.filter((row) => row.qualityState === "ready").length;
  const needsEnrichmentRows = rows.filter(
    (row) => row.qualityState === "needs_enrichment"
  ).length;
  const missingBrand = rows.filter((row) => {
    const brand = row.brand?.trim().toLowerCase();
    return !brand || brand === "unknown";
  }).length;
  const missingVariant = rows.filter((row) => isBlank(row.variant)).length;
  const missingSku = rows.filter((row) => isBlank(row.sku)).length;
  const missingProductUrl = rows.filter((row) =>
    isBlank(row.productUrl)
  ).length;
  const missingEvidence = rows.filter(
    (row) => (row.evidenceRefs?.length ?? 0) < 1
  ).length;
  const missingImage = rows.filter(
    (row) => (row.imageUrls?.length ?? 0) < 1
  ).length;
  const missingConnector = rows.filter((row) => {
    const from = row.connectorFrom?.trim().toLowerCase();
    const to = row.connectorTo?.trim().toLowerCase();
    return !(from && to) || from === "unknown" || to === "unknown";
  }).length;

  const usbCToCMissingWattsRows = rows.filter((row) => {
    const from = row.connectorFrom?.trim();
    const to = row.connectorTo?.trim();
    const watts = row.power?.maxWatts ?? 0;
    return from === "USB-C" && to === "USB-C" && watts <= 0;
  });

  const qualityIssueCounts = new Map<string, number>();
  for (const row of rows) {
    for (const issue of row.qualityIssues ?? []) {
      qualityIssueCounts.set(issue, (qualityIssueCounts.get(issue) ?? 0) + 1);
    }
  }
  const topQualityIssues = [...qualityIssueCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 7)
    .map(([issue, count]) => ({ issue, count }));

  return {
    rows: rows.length,
    readyRows,
    needsEnrichmentRows,
    missingBrand,
    missingVariant,
    missingSku,
    missingProductUrl,
    missingEvidence,
    missingImage,
    missingConnector,
    usbCToCMissingWatts: usbCToCMissingWattsRows.length,
    topQualityIssues,
    tuningCandidates: usbCToCMissingWattsRows.slice(0, 7).map((row) => ({
      model: row.model ?? "",
      sku: row.sku ?? "",
      variant: row.variant ?? "",
      productUrl: row.productUrl ?? "",
    })),
  };
};

const askWithDefault = async (
  rl: ReturnType<typeof createInterface>,
  label: string,
  fallback: string
): Promise<string> => {
  const value = await rl.question(`${label} [${fallback}]: `);
  const trimmed = value.trim();
  return trimmed || fallback;
};

const runInteractive = async (options: CliOptions): Promise<CliOptions> => {
  if (!(input.isTTY && output.isTTY)) {
    throw new Error("Interactive mode needs a TTY. Use --yes with arguments.");
  }

  const rl = createInterface({ input, output });
  try {
    print("Cable Intel ingest manager");
    print("");
    print("Choose mode:");
    print("  1) Seed + quality report from Vercel URL (recommended)");
    print("  2) Seed + quality report from Convex deployment name");
    print("  3) Quality report only");

    const mode = (await rl.question("Mode [1]: ")).trim() || "1";
    const next = { ...options };
    if (mode === "1") {
      const vercelInput = await askWithDefault(
        rl,
        "Vercel deployment URL",
        "https://www.cableintel.com"
      );
      next.vercelUrl = normalizeVercelUrl(vercelInput);
      next.deploymentName = null;
      next.reportOnly = false;
    } else if (mode === "2") {
      const deployment = await rl.question("Convex deployment name: ");
      next.deploymentName = deployment.trim();
      if (!next.deploymentName) {
        throw new Error("Deployment name is required.");
      }
      next.vercelUrl = null;
      next.reportOnly = false;
    } else if (mode === "3") {
      const source = (
        await rl.question("Use (v)ercel URL or (d)eployment name? [d]: ")
      )
        .trim()
        .toLowerCase();
      if (source === "v") {
        const vercelInput = await askWithDefault(
          rl,
          "Vercel deployment URL",
          "https://www.cableintel.com"
        );
        next.vercelUrl = normalizeVercelUrl(vercelInput);
        next.deploymentName = null;
      } else {
        const deployment = await rl.question("Convex deployment name: ");
        next.deploymentName = deployment.trim();
        if (!next.deploymentName) {
          throw new Error("Deployment name is required.");
        }
        next.vercelUrl = null;
      }
      next.reportOnly = true;
    } else {
      throw new Error(`Unknown mode: ${mode}`);
    }

    if (!next.reportOnly) {
      next.templateId = await askWithDefault(
        rl,
        "Template id",
        next.templateId
      );
      next.discoverMax = parsePositiveInt(
        await askWithDefault(rl, "Discover max", String(next.discoverMax)),
        "discover max"
      );
      next.seedMax = parsePositiveInt(
        await askWithDefault(rl, "Seed max", String(next.seedMax)),
        "seed max"
      );
      const allowedDomain = await askWithDefault(
        rl,
        "Allowed domain",
        next.allowedDomain ?? ""
      );
      next.allowedDomain = allowedDomain.trim() || null;
    }
    return next;
  } finally {
    rl.close();
  }
};

const main = async (): Promise<void> => {
  let options = parseArgs(process.argv.slice(2));
  const repoRoot = findRepoRoot(process.cwd());
  const backendDir = join(repoRoot, "packages", "backend");

  if (
    !(
      options.yes ||
      options.deploymentName ||
      options.vercelUrl ||
      options.reportOnly
    )
  ) {
    options = await runInteractive(options);
  }

  let deploymentName = options.deploymentName;
  if (!deploymentName) {
    const vercelUrl = options.vercelUrl;
    if (!vercelUrl) {
      throw new Error("Provide --deployment-name or --vercel-url.");
    }
    print(`Resolving Convex deployment from ${vercelUrl} ...`);
    const resolved = await resolveDeploymentFromVercelUrl(vercelUrl);
    deploymentName = resolved.deploymentName;
    print(`Convex URL: ${resolved.convexUrl}`);
  }

  print(`Using Convex deployment: ${deploymentName}`);

  if (!options.reportOnly) {
    const discoveredSeedUrls = runConvex<string[]>(
      "ingest:discoverShopifySeedUrls",
      deploymentName,
      {
        templateId: options.templateId,
        maxItems: options.discoverMax,
      },
      backendDir
    );
    const seedUrls = discoveredSeedUrls.slice(0, options.seedMax);
    if (seedUrls.length === 0) {
      throw new Error(
        `No seed URLs discovered for template '${options.templateId}'.`
      );
    }

    print(
      `Discovered ${discoveredSeedUrls.length} URLs, seeding ${seedUrls.length}.`
    );
    const ingestResult = runConvex<{
      completedItems: number;
      failedItems: number;
      status: string;
      totalItems: number;
      workflowRunId: string;
    }>(
      "ingest:runSeedIngest",
      deploymentName,
      {
        seedUrls,
        maxItems: seedUrls.length,
        ...(options.allowedDomain
          ? { allowedDomains: [options.allowedDomain] }
          : {}),
      },
      backendDir
    );
    print(
      `Ingest workflow ${ingestResult.workflowRunId}: ${ingestResult.completedItems}/${ingestResult.totalItems} completed, ${ingestResult.failedItems} failed, status=${ingestResult.status}`
    );
  }

  const rows = runConvex<CatalogRow[]>(
    "ingestQueries:getTopCablesForReview",
    deploymentName,
    { limit: 500 },
    backendDir
  );
  const enrichmentQueue = runConvex<{
    failed: number;
    inProgress: number;
    pending: number;
  }>("ingestQueries:getEnrichmentQueueSummary", deploymentName, {}, backendDir);
  const quality = analyzeRows(rows);

  print("");
  print("Enrichment queue summary:");
  print(JSON.stringify(enrichmentQueue, null, 2));
  print("");
  print("Quality summary:");
  print(JSON.stringify(quality, null, 2));
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});

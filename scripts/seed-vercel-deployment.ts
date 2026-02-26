#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

interface CliOptions {
  allowedDomain: string | null;
  backendDir: string;
  deploymentName: string | null;
  discoverMax: number;
  seedMax: number;
  templateId: string;
  vercelBypassSecret: string | null;
  vercelUrl: string | null;
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
  sku?: string;
  variant?: string;
}

interface ManualInferenceSession {
  draft?: {
    connectorFrom?: string;
    connectorTo?: string;
    gbps?: string;
    usbGeneration?: string;
    watts?: string;
  };
  lastError?: string;
  status?: string;
}

const DEFAULT_TEMPLATE_ID = "anker-us";
const DEFAULT_DISCOVER_MAX = 30;
const DEFAULT_SEED_MAX = 8;
const DEFAULT_ALLOWED_DOMAIN = "anker.com";
const APP_ENTRY_REGEX = /_app\/immutable\/entry\/app\.[^"' )]+\.js/;
const NODE_ZERO_REGEX = /\.\.\/nodes\/0\.[^"' )]+\.js/;
const DOT_SLASH_PREFIX_REGEX = /^\.?\//;
const DOT_DOT_SLASH_PREFIX_REGEX = /^\.\.\//;
const CONVEX_URL_REGEX = /https:\/\/[a-z0-9-]+\.convex\.cloud/i;

const printUsage = (): void => {
  console.log(
    [
      "Usage:",
      "  bun run scripts/seed-vercel-deployment.ts [options]",
      "",
      "Options:",
      "  --vercel-url <url>        Vercel deployment URL (or use VERCEL_URL env)",
      "  --deployment-name <name>  Convex deployment name (skip URL discovery)",
      "  --template-id <id>        Shopify template id (default: anker-us)",
      "  --discover-max <n>        Max URLs to discover (default: 30)",
      "  --seed-max <n>            Max URLs to seed (default: 8)",
      "  --allowed-domain <host>   Allowed ingest domain (default: anker.com)",
      "  --vercel-bypass-secret    Vercel automation bypass secret",
      "  --backend-dir <path>      Backend package dir (default: packages/backend)",
      "  --help                    Show this message",
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
    vercelUrl: process.env.VERCEL_URL
      ? normalizeVercelUrl(process.env.VERCEL_URL)
      : null,
    vercelBypassSecret: process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? null,
    deploymentName: null,
    templateId: DEFAULT_TEMPLATE_ID,
    discoverMax: DEFAULT_DISCOVER_MAX,
    seedMax: DEFAULT_SEED_MAX,
    allowedDomain: DEFAULT_ALLOWED_DOMAIN,
    backendDir: "packages/backend",
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
    "--vercel-bypass-secret": (value) => {
      const trimmed = value.trim();
      options.vercelBypassSecret = trimmed || null;
    },
    "--backend-dir": (value) => {
      options.backendDir = value.trim();
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

  if (!(options.deploymentName || options.vercelUrl)) {
    throw new Error(
      "Provide --deployment-name or --vercel-url (or set VERCEL_URL)."
    );
  }

  return options;
};

const fetchText = async (
  url: string,
  bypassSecret: string | null
): Promise<string> => {
  const response = await fetch(url, {
    headers: {
      "user-agent": "cable-intel-seed-script/1.0",
      ...(bypassSecret
        ? {
            "x-vercel-protection-bypass": bypassSecret,
          }
        : {}),
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

const extractConvexUrl = (nodeCode: string): string => {
  const match = nodeCode.match(CONVEX_URL_REGEX);
  if (!match?.[0]) {
    throw new Error("Unable to find Convex URL in node bundle.");
  }
  return match[0];
};

const resolveDeploymentNameFromVercelUrl = async (
  vercelUrl: string,
  bypassSecret: string | null
): Promise<{ convexUrl: string; deploymentName: string }> => {
  const html = await fetchText(vercelUrl, bypassSecret);
  const appEntryPath = extractAppEntryPath(html);
  const appCode = await fetchText(
    new URL(appEntryPath, vercelUrl).toString(),
    bypassSecret
  );
  const nodeZeroPath = extractNodeZeroPath(appCode);
  const nodeCode = await fetchText(
    new URL(nodeZeroPath, vercelUrl).toString(),
    bypassSecret
  );
  const convexUrl = extractConvexUrl(nodeCode);
  const deploymentName = new URL(convexUrl).hostname.split(".")[0];
  if (!deploymentName) {
    throw new Error(`Could not parse deployment name from ${convexUrl}`);
  }
  return {
    convexUrl,
    deploymentName,
  };
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

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: JSON scanning uses an explicit string/escape depth state machine.
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

const parseTrailingJson = <T>(text: string): T | null => {
  const startIndexes = [...text.matchAll(/[[{]/g)].map((match) => {
    return match.index ?? -1;
  });

  for (const start of startIndexes) {
    if (start < 0) {
      continue;
    }
    const candidate = findBalancedJsonSlice(text, start);
    if (!candidate) {
      continue;
    }
    const trailing = text.slice(start + candidate.length).trim();
    if (trailing.length > 0) {
      continue;
    }
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // Keep scanning candidates.
    }
  }

  return null;
};

const parseJsonOutput = <T>(raw: string): T => {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Expected JSON output but command returned empty output.");
  }

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const parsed = parseTrailingJson<T>(trimmed);
    if (parsed !== null) {
      return parsed;
    }
    throw new Error(`Failed to parse command output as JSON:\n${trimmed}`);
  }
};

const runConvex = <T>(
  functionName: string,
  deploymentName: string,
  args: unknown,
  cwd: string
): T => {
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
    cwd
  );
  return parseJsonOutput<T>(raw);
};

const parseMaxWatts = (value: string | undefined): number => {
  if (!value) {
    return 0;
  }
  const matches = [...value.matchAll(/\d{1,3}/g)]
    .map((match) => Number.parseInt(match[0], 10))
    .filter((candidate) => Number.isFinite(candidate));
  if (matches.length === 0) {
    return 0;
  }
  return Math.max(...matches);
};

const verifyManualInferenceOnPreview = (
  deploymentName: string,
  cwd: string
): void => {
  const workspaceId = `preview-manual-inference-${Date.now()}`;

  runConvex<unknown>(
    "manualInference:ensureSession",
    deploymentName,
    { workspaceId },
    cwd
  );

  const response = runConvex<ManualInferenceSession | null>(
    "manualInference:submitPrompt",
    deploymentName,
    {
      workspaceId,
      prompt: "usb c to usb c cable 240w usb4 8k 60hz",
    },
    cwd
  );

  if (!response) {
    throw new Error("manualInference:submitPrompt returned null.");
  }
  if (response.status === "failed") {
    throw new Error(
      `manualInference:submitPrompt failed: ${response.lastError ?? "unknown error"}`
    );
  }

  const connectorFrom = response.draft?.connectorFrom ?? "";
  const connectorTo = response.draft?.connectorTo ?? "";
  if (connectorFrom !== "USB-C" || connectorTo !== "USB-C") {
    throw new Error(
      `manualInference connector mismatch (from=${connectorFrom}, to=${connectorTo}).`
    );
  }

  const maxWatts = parseMaxWatts(response.draft?.watts);
  if (maxWatts < 240) {
    throw new Error(
      `manualInference watts validation failed (watts='${response.draft?.watts ?? ""}').`
    );
  }

  const generation = (response.draft?.usbGeneration ?? "").toLowerCase();
  const gbps = (response.draft?.gbps ?? "").toLowerCase();
  if (
    !(
      generation.includes("usb4") ||
      generation.includes("thunderbolt") ||
      gbps.includes("40") ||
      gbps.includes("20")
    )
  ) {
    throw new Error(
      `manualInference data class validation failed (usbGeneration='${response.draft?.usbGeneration ?? ""}', gbps='${response.draft?.gbps ?? ""}').`
    );
  }

  console.log(
    "Manual inference runtime check passed (USB-C/USB-C, >=240W, high-speed data class)."
  );
};

const isBlank = (value: string | undefined): boolean => {
  return !value || value.trim().length === 0;
};

const analyzeRows = (rows: readonly CatalogRow[]) => {
  const missingBrand = rows.filter((row) => {
    const brand = row.brand?.trim().toLowerCase();
    return !brand || brand === "unknown";
  });
  const missingVariant = rows.filter((row) => isBlank(row.variant));
  const missingSku = rows.filter((row) => isBlank(row.sku));
  const missingProductUrl = rows.filter((row) => isBlank(row.productUrl));
  const missingEvidence = rows.filter(
    (row) => (row.evidenceRefs?.length ?? 0) < 1
  );
  const missingImage = rows.filter((row) => (row.imageUrls?.length ?? 0) < 1);
  const missingConnector = rows.filter((row) => {
    const from = row.connectorFrom?.trim().toLowerCase();
    const to = row.connectorTo?.trim().toLowerCase();
    return !(from && to) || from === "unknown" || to === "unknown";
  });
  const usbCToCMissingWatts = rows.filter((row) => {
    const from = row.connectorFrom?.trim();
    const to = row.connectorTo?.trim();
    const watts = row.power?.maxWatts ?? 0;
    return from === "USB-C" && to === "USB-C" && watts <= 0;
  });
  const variantEqualsSku = rows.filter((row) => {
    if (!(row.variant && row.sku)) {
      return false;
    }
    return row.variant.trim().toLowerCase() === row.sku.trim().toLowerCase();
  });

  return {
    rows: rows.length,
    missingBrand: missingBrand.length,
    missingVariant: missingVariant.length,
    missingSku: missingSku.length,
    missingProductUrl: missingProductUrl.length,
    missingEvidence: missingEvidence.length,
    missingImage: missingImage.length,
    missingConnector: missingConnector.length,
    usbCToCMissingWatts: usbCToCMissingWatts.length,
    variantEqualsSku: variantEqualsSku.length,
    tuningCandidates: usbCToCMissingWatts.slice(0, 10).map((row) => ({
      model: row.model ?? "",
      sku: row.sku ?? "",
      variant: row.variant ?? "",
      productUrl: row.productUrl ?? "",
    })),
  };
};

const main = async (): Promise<void> => {
  const options = parseArgs(process.argv.slice(2));
  const backendDir = resolve(options.backendDir);

  let deploymentName = options.deploymentName;
  let convexUrl: string | null = null;
  if (!deploymentName) {
    const vercelUrl = options.vercelUrl;
    if (!vercelUrl) {
      throw new Error("Missing Vercel URL.");
    }
    const resolved = await resolveDeploymentNameFromVercelUrl(
      vercelUrl,
      options.vercelBypassSecret
    );
    deploymentName = resolved.deploymentName;
    convexUrl = resolved.convexUrl;
    console.log(`Resolved Convex URL: ${convexUrl}`);
  }

  if (!deploymentName) {
    throw new Error("Failed to resolve Convex deployment name.");
  }
  console.log(`Using Convex deployment: ${deploymentName}`);

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

  console.log(
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
  console.log(
    `Ingest workflow ${ingestResult.workflowRunId}: ${ingestResult.completedItems}/${ingestResult.totalItems} completed, ${ingestResult.failedItems} failed, status=${ingestResult.status}`
  );

  const rows = runConvex<CatalogRow[]>(
    "ingestQueries:getTopCables",
    deploymentName,
    { limit: 500 },
    backendDir
  );
  if (!Array.isArray(rows)) {
    throw new Error(
      `ingestQueries:getTopCables returned non-array payload: ${JSON.stringify(rows)}`
    );
  }
  const quality = analyzeRows(rows);

  console.log("Quality summary:");
  console.log(JSON.stringify(quality, null, 2));

  verifyManualInferenceOnPreview(deploymentName, backendDir);
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});

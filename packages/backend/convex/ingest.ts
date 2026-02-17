"use node";

import { createHash } from "node:crypto";
import { gateway, generateObject } from "ai";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action } from "./_generated/server";
import { getIngestConfig } from "./config";
import {
  extractionOutputSchema,
  parseExtractionOutput,
} from "./contracts/extraction";

const MAX_MARKDOWN_CHARS = 120_000;
const FIRECRAWL_SCRAPE_URL = "https://api.firecrawl.dev/v1/scrape";

interface ScrapedSnapshot {
  canonicalUrl: string;
  fetchedAt: number;
  html: string;
  markdown: string;
  ogImage: string | undefined;
  url: string;
}

interface RunSeedIngestResult {
  completedItems: number;
  failedItems: number;
  status: Doc<"ingestionWorkflows">["status"];
  totalItems: number;
  workflowRunId: Id<"ingestionWorkflows">;
}

const canonicalizeUrl = (value: string): string => {
  const parsed = new URL(value);
  parsed.hash = "";
  const normalized = parsed.toString();
  return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
};

const isAllowedDomain = (
  urlString: string,
  allowedDomains: readonly string[]
): boolean => {
  if (allowedDomains.length === 0) {
    return true;
  }
  const { hostname } = new URL(urlString);
  const normalizedHost = hostname.toLowerCase();
  return allowedDomains.some((domain) => {
    const normalizedDomain = domain.toLowerCase();
    return (
      normalizedHost === normalizedDomain ||
      normalizedHost.endsWith(`.${normalizedDomain}`)
    );
  });
};

const normalizeSeedUrls = (
  urls: readonly string[],
  allowedDomains: readonly string[],
  maxItems?: number
): string[] => {
  const normalized: string[] = [];
  for (const url of urls) {
    if (!isAllowedDomain(url, allowedDomains)) {
      continue;
    }
    normalized.push(canonicalizeUrl(url));
  }
  const deduped = [...new Set(normalized)];
  if (typeof maxItems === "number") {
    return deduped.slice(0, Math.max(maxItems, 0));
  }
  return deduped;
};

const delay = async (ms: number): Promise<void> => {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

const stringFromUnknown = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }
  return "";
};

const scrapeUrl = async (
  url: string,
  firecrawlApiKey: string
): Promise<ScrapedSnapshot> => {
  const response = await fetch(FIRECRAWL_SCRAPE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${firecrawlApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url,
      formats: ["markdown"],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Firecrawl scrape failed (${response.status}): ${body}`);
  }

  const raw = (await response.json()) as {
    data?: {
      html?: unknown;
      markdown?: unknown;
      metadata?: {
        ogImage?: unknown;
        sourceURL?: unknown;
      };
    };
    error?: unknown;
    success?: unknown;
  };

  if (raw.success !== true) {
    throw new Error(
      `Firecrawl scrape unsuccessful: ${stringFromUnknown(raw.error)}`
    );
  }

  const markdown = stringFromUnknown(raw.data?.markdown).trim();
  const html = stringFromUnknown(raw.data?.html).trim();
  if (!(markdown || html)) {
    throw new Error("Firecrawl scrape returned empty markdown and html");
  }

  const sourceUrl = stringFromUnknown(raw.data?.metadata?.sourceURL);
  const canonicalUrl = sourceUrl
    ? canonicalizeUrl(sourceUrl)
    : canonicalizeUrl(url);
  const ogImageValue = stringFromUnknown(raw.data?.metadata?.ogImage);

  return {
    url,
    canonicalUrl,
    markdown,
    html,
    fetchedAt: Date.now(),
    ogImage: ogImageValue || undefined,
  };
};

const EXTRACTION_SYSTEM_PROMPT = [
  "You extract structured cable specs from product pages.",
  "Only include values explicitly supported by the source content.",
  "Do not guess missing values.",
  "Always return evidence entries for brand, model, connectorPair.from, and connectorPair.to.",
].join(" ");

const buildExtractionPrompt = (
  snapshot: ScrapedSnapshot,
  contentHash: string
): string => {
  const markdownInput = snapshot.markdown.slice(0, MAX_MARKDOWN_CHARS);
  const promptLines = [
    `Source URL: ${snapshot.url}`,
    `Canonical URL: ${snapshot.canonicalUrl}`,
    `Fetched At (unix ms): ${snapshot.fetchedAt}`,
    `Content Hash: ${contentHash}`,
    "",
    "Extract cable fields and return strict JSON for the schema.",
    "Connector names should be short and practical (example: USB-C, USB-A, Lightning).",
    "Use evidence entries with fieldPath and short snippet whenever possible.",
    "",
    "<markdown>",
    markdownInput,
    "</markdown>",
  ];

  if (snapshot.html.trim().length > 0) {
    promptLines.push("", "<html>", snapshot.html, "</html>");
  }

  return promptLines.join("\n");
};

const dedupeImageUrls = (urls: readonly string[]): string[] => {
  const candidates: string[] = [];
  for (const url of urls) {
    const value = url.trim();
    if (!value) {
      continue;
    }
    try {
      candidates.push(new URL(value).toString());
    } catch {
      // Ignore non-URL values from model output.
    }
  }
  return [...new Set(candidates)];
};

const extractCableFromSnapshot = async (
  model: string,
  snapshot: ScrapedSnapshot,
  contentHash: string
) => {
  const prompt = buildExtractionPrompt(snapshot, contentHash);
  const { object } = await generateObject({
    model: gateway(model),
    schema: extractionOutputSchema,
    system: EXTRACTION_SYSTEM_PROMPT,
    prompt,
    temperature: 0,
  });

  const parsed = parseExtractionOutput(object);
  const mergedImageUrls = dedupeImageUrls([
    ...parsed.images.map((image) => image.url),
    ...(snapshot.ogImage ? [snapshot.ogImage] : []),
  ]);

  return {
    ...parsed,
    images: mergedImageUrls.map((url) => ({ url })),
  };
};

export const runSeedIngest = action({
  args: {
    seedUrls: v.array(v.string()),
    allowedDomains: v.optional(v.array(v.string())),
    maxItems: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<RunSeedIngestResult> => {
    const config = getIngestConfig();
    const allowedDomains = args.allowedDomains ?? [];
    const normalizedUrls = normalizeSeedUrls(
      args.seedUrls,
      allowedDomains,
      args.maxItems
    );

    const startedAt = Date.now();
    const workflowRunId: Id<"ingestionWorkflows"> = await ctx.runMutation(
      internal.ingestDb.createWorkflow,
      {
        allowedDomains,
        seedUrls: normalizedUrls,
        startedAt,
        totalItems: normalizedUrls.length,
      }
    );
    const itemIds = await ctx.runMutation(
      internal.ingestDb.createWorkflowItems,
      {
        workflowRunId,
        urls: normalizedUrls,
        createdAt: startedAt,
      }
    );

    let workflowLastError: string | undefined;
    for (const [index, url] of normalizedUrls.entries()) {
      const itemId = itemIds[index];
      if (!itemId) {
        throw new Error(`Missing workflow item for URL index ${index}`);
      }
      let itemCompleted = false;
      let lastItemError = "";

      for (let attempt = 1; attempt <= config.maxParseRetries; attempt += 1) {
        const now = Date.now();
        await ctx.runMutation(internal.ingestDb.updateWorkflowItemStatus, {
          itemId,
          status: "in_progress",
          now,
          incrementAttemptCount: true,
        });

        try {
          const snapshot = await scrapeUrl(url, config.firecrawlApiKey);
          const contentHash = createHash("sha256")
            .update(
              `${snapshot.canonicalUrl}\n${snapshot.markdown}\n${snapshot.html}`
            )
            .digest("hex");

          const evidenceSourceId = await ctx.runMutation(
            internal.ingestDb.insertEvidenceSource,
            {
              workflowRunId,
              url: snapshot.url,
              canonicalUrl: snapshot.canonicalUrl,
              fetchedAt: snapshot.fetchedAt,
              contentHash,
              html: snapshot.html,
              markdown: snapshot.markdown,
              createdAt: now,
            }
          );

          const parsed = await extractCableFromSnapshot(
            config.model,
            snapshot,
            contentHash
          );

          const { normalizedSpecId } = await ctx.runMutation(
            internal.ingestDb.upsertVariantAndInsertSpec,
            {
              workflowRunId,
              sourceUrl: snapshot.url,
              evidenceSourceId,
              parsed,
              now,
            }
          );

          await ctx.runMutation(internal.ingestDb.updateWorkflowItemStatus, {
            itemId,
            status: "completed",
            now: Date.now(),
            evidenceSourceId,
            normalizedSpecId,
          });
          itemCompleted = true;
          break;
        } catch (error) {
          lastItemError = getErrorMessage(error);
          const isLastAttempt = attempt === config.maxParseRetries;
          if (!isLastAttempt) {
            const retryDelayMs = Math.min(
              config.initialRetryDelayMs * 2 ** (attempt - 1),
              config.maxRetryDelayMs
            );
            await delay(retryDelayMs);
          }
        }
      }

      if (!itemCompleted) {
        workflowLastError = workflowLastError ?? lastItemError;
        await ctx.runMutation(internal.ingestDb.updateWorkflowItemStatus, {
          itemId,
          status: "failed",
          now: Date.now(),
          lastError: lastItemError,
        });
      }
    }

    await ctx.runMutation(internal.ingestDb.finalizeWorkflow, {
      workflowRunId,
      finishedAt: Date.now(),
      lastError: workflowLastError,
    });

    const workflow: Doc<"ingestionWorkflows"> | null = await ctx.runQuery(
      internal.ingestDb.getWorkflowStatus,
      {
        workflowRunId,
      }
    );

    if (!workflow) {
      throw new Error(`Workflow not found after finalize: ${workflowRunId}`);
    }

    return {
      workflowRunId,
      totalItems: workflow.totalItems,
      completedItems: workflow.completedItems,
      failedItems: workflow.failedItems,
      status: workflow.status,
    };
  },
});

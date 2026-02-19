import { describe, expect, it } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { convexTest } from "convex-test";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const MODULE_FILE_REGEX = /\.[cm]?[jt]sx?$/;
const DECLARATION_FILE_SUFFIX = ".d.ts";

const modules = (() => {
  const loaders: Record<string, () => Promise<unknown>> = {};

  const collectModulePaths = (directory: string, prefix = ""): string[] => {
    const entries = readdirSync(directory, {
      withFileTypes: true,
    });
    const modulePaths: string[] = [];
    for (const entry of entries) {
      if (entry.isDirectory()) {
        modulePaths.push(
          ...collectModulePaths(
            join(directory, entry.name),
            `${prefix}${entry.name}/`
          )
        );
      } else if (
        entry.name.match(MODULE_FILE_REGEX) &&
        !entry.name.endsWith(DECLARATION_FILE_SUFFIX)
      ) {
        modulePaths.push(`${prefix}${entry.name}`);
      }
    }
    return modulePaths;
  };

  for (const filePath of collectModulePaths(import.meta.dir)) {
    if (filePath.endsWith(".test.ts")) {
      continue;
    }
    loaders[`./${filePath}`] = async () => import(`./${filePath}`);
  }

  return loaders;
})();

const createEvidenceRefs = (sourceUrl: string) => {
  return [
    { fieldPath: "brand", sourceUrl, snippet: "Anker" },
    {
      fieldPath: "model",
      sourceUrl,
      snippet: "Anker Prime USB-C Cable",
    },
    { fieldPath: "connectorPair.from", sourceUrl, snippet: "USB-C" },
    { fieldPath: "connectorPair.to", sourceUrl, snippet: "USB-C" },
  ];
};

describe("catalog quality gating", () => {
  it("returns only ready rows in getTopCables and queues enrichment for low-quality rows", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();

    const workflowRunId = await t.mutation(internal.ingestDb.createWorkflow, {
      allowedDomains: [],
      seedUrls: [
        "https://example.com/products/ready-cable",
        "https://example.com/products/needs-enrichment-cable",
      ],
      startedAt: now,
      totalItems: 2,
    });

    const readySourceId = await t.mutation(
      internal.ingestDb.insertEvidenceSource,
      {
        workflowRunId,
        url: "https://example.com/products/ready-cable",
        canonicalUrl: "https://example.com/products/ready-cable",
        fetchedAt: now,
        contentHash: "ready-hash",
        html: "<html></html>",
        markdown: "ready",
        createdAt: now,
      }
    );

    await t.mutation(internal.ingestDb.upsertVariantAndInsertSpec, {
      workflowRunId,
      sourceUrl: "https://example.com/products/ready-cable",
      evidenceSourceId: readySourceId,
      now,
      parsed: {
        brand: "Anker",
        model: "Anker Prime USB-C Cable",
        variant: "1 m",
        sku: "READY-100W",
        connectorPair: {
          from: "USB-C",
          to: "USB-C",
        },
        power: {
          maxWatts: 100,
          pdSupported: true,
        },
        data: {},
        video: {},
        images: [{ url: "https://images.example.com/ready.jpg" }],
        evidence: createEvidenceRefs(
          "https://example.com/products/ready-cable"
        ),
      },
    });

    const needsSourceId = await t.mutation(
      internal.ingestDb.insertEvidenceSource,
      {
        workflowRunId,
        url: "https://example.com/products/needs-enrichment-cable",
        canonicalUrl: "https://example.com/products/needs-enrichment-cable",
        fetchedAt: now,
        contentHash: "needs-hash",
        html: "<html></html>",
        markdown: "needs",
        createdAt: now,
      }
    );

    await t.mutation(internal.ingestDb.upsertVariantAndInsertSpec, {
      workflowRunId,
      sourceUrl: "https://example.com/products/needs-enrichment-cable",
      evidenceSourceId: needsSourceId,
      now,
      parsed: {
        brand: "Anker",
        model: "Anker Prime USB-C Cable",
        variant: "2 m",
        sku: "NEEDS-UNKNOWN",
        connectorPair: {
          from: "USB-C",
          to: "USB-C",
        },
        power: {},
        data: {},
        video: {},
        images: [{ url: "https://images.example.com/needs.jpg" }],
        evidence: createEvidenceRefs(
          "https://example.com/products/needs-enrichment-cable"
        ),
      },
    });

    const visibleRows = await t.query(api.ingestQueries.getTopCables, {
      limit: 10,
    });
    expect(visibleRows.length).toBe(1);
    expect(visibleRows[0]?.qualityState).toBe("ready");

    const reviewRows = await t.query(api.ingestQueries.getTopCablesForReview, {
      limit: 10,
    });
    expect(reviewRows.length).toBe(2);
    expect(
      reviewRows.some((row) => row.qualityState === "needs_enrichment")
    ).toBe(true);

    const queueSummary = await t.query(
      api.ingestQueries.getEnrichmentQueueSummary,
      {}
    );
    expect(queueSummary.pending).toBeGreaterThanOrEqual(1);
  });
});

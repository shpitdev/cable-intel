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

const createEvidenceRefs = (
  sourceUrl: string,
  options?: {
    brand?: string;
    connectorFrom?: string;
    connectorTo?: string;
    model?: string;
  }
) => {
  const brand = options?.brand ?? "Anker";
  const model = options?.model ?? "Anker Prime USB-C Cable";
  const connectorFrom = options?.connectorFrom ?? "USB-C";
  const connectorTo = options?.connectorTo ?? "USB-C";
  return [
    { fieldPath: "brand", sourceUrl, snippet: brand },
    {
      fieldPath: "model",
      sourceUrl,
      snippet: model,
    },
    { fieldPath: "connectorPair.from", sourceUrl, snippet: connectorFrom },
    { fieldPath: "connectorPair.to", sourceUrl, snippet: connectorTo },
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
    const readyRow = reviewRows.find((row) => row.qualityState === "ready");
    expect(readyRow).toBeDefined();
    expect(readyRow?.qualityIssues).toEqual([]);
    expect(
      reviewRows.some((row) => row.qualityState === "needs_enrichment")
    ).toBe(true);

    const queueSummary = await t.query(
      api.ingestQueries.getEnrichmentQueueSummary,
      {}
    );
    expect(queueSummary.pending).toBeGreaterThanOrEqual(1);
  });

  it("prefers connector-pair matches even when requested brand is unavailable", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();

    const workflowRunId = await t.mutation(internal.ingestDb.createWorkflow, {
      allowedDomains: [],
      seedUrls: [
        "https://example.com/products/anker-c-c-240",
        "https://example.com/products/satechi-c-a-100",
        "https://example.com/products/belkin-c-a-60",
      ],
      startedAt: now,
      totalItems: 3,
    });

    const insertReadyRow = async (row: {
      brand: string;
      connectorFrom: string;
      connectorTo: string;
      maxWatts: number;
      model: string;
      sku: string;
      sourceUrl: string;
      variant: string;
    }) => {
      const sourceId = await t.mutation(
        internal.ingestDb.insertEvidenceSource,
        {
          workflowRunId,
          url: row.sourceUrl,
          canonicalUrl: row.sourceUrl,
          fetchedAt: now,
          contentHash: `${row.sku}-hash`,
          html: "<html></html>",
          markdown: row.model,
          createdAt: now,
        }
      );

      await t.mutation(internal.ingestDb.upsertVariantAndInsertSpec, {
        workflowRunId,
        sourceUrl: row.sourceUrl,
        evidenceSourceId: sourceId,
        now,
        parsed: {
          brand: row.brand,
          model: row.model,
          variant: row.variant,
          sku: row.sku,
          connectorPair: {
            from: row.connectorFrom,
            to: row.connectorTo,
          },
          power: {
            maxWatts: row.maxWatts,
            pdSupported: true,
          },
          data: {},
          video: {},
          images: [{ url: `https://images.example.com/${row.sku}.jpg` }],
          evidence: createEvidenceRefs(row.sourceUrl, {
            brand: row.brand,
            model: row.model,
            connectorFrom: row.connectorFrom,
            connectorTo: row.connectorTo,
          }),
        },
      });
    };

    await insertReadyRow({
      brand: "Anker",
      model: "Anker Prime Cable",
      variant: "1 m",
      sku: "ANKER-CC-240",
      connectorFrom: "USB-C",
      connectorTo: "USB-C",
      maxWatts: 240,
      sourceUrl: "https://example.com/products/anker-c-c-240",
    });
    await insertReadyRow({
      brand: "Satechi",
      model: "Satechi USB-C to USB-A Cable",
      variant: "1 m",
      sku: "SATECHI-CA-100",
      connectorFrom: "USB-C",
      connectorTo: "USB-A",
      maxWatts: 100,
      sourceUrl: "https://example.com/products/satechi-c-a-100",
    });
    await insertReadyRow({
      brand: "Belkin",
      model: "Belkin USB-C to USB-A Cable",
      variant: "2 m",
      sku: "BELKIN-CA-60",
      connectorFrom: "USB-C",
      connectorTo: "USB-A",
      maxWatts: 60,
      sourceUrl: "https://example.com/products/belkin-c-a-60",
    });

    const rows = await t.query(api.ingestQueries.getTopCables, {
      limit: 10,
      searchQuery: "anker usbc to usba",
    });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]?.connectorFrom).toBe("USB-C");
    expect(rows[0]?.connectorTo).toBe("USB-A");
  });

  it("handles misspelled brand terms and still ranks intended brand first", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();

    const workflowRunId = await t.mutation(internal.ingestDb.createWorkflow, {
      allowedDomains: [],
      seedUrls: [
        "https://example.com/products/anker-c-c-240",
        "https://example.com/products/satechi-c-c-240",
      ],
      startedAt: now,
      totalItems: 2,
    });

    const insertReadyRow = async (row: {
      brand: string;
      model: string;
      sku: string;
      sourceUrl: string;
    }) => {
      const sourceId = await t.mutation(
        internal.ingestDb.insertEvidenceSource,
        {
          workflowRunId,
          url: row.sourceUrl,
          canonicalUrl: row.sourceUrl,
          fetchedAt: now,
          contentHash: `${row.sku}-hash`,
          html: "<html></html>",
          markdown: row.model,
          createdAt: now,
        }
      );

      await t.mutation(internal.ingestDb.upsertVariantAndInsertSpec, {
        workflowRunId,
        sourceUrl: row.sourceUrl,
        evidenceSourceId: sourceId,
        now,
        parsed: {
          brand: row.brand,
          model: row.model,
          variant: "1 m",
          sku: row.sku,
          connectorPair: {
            from: "USB-C",
            to: "USB-C",
          },
          power: {
            maxWatts: 240,
            pdSupported: true,
          },
          data: {},
          video: {},
          images: [{ url: `https://images.example.com/${row.sku}.jpg` }],
          evidence: createEvidenceRefs(row.sourceUrl, {
            brand: row.brand,
            model: row.model,
          }),
        },
      });
    };

    await insertReadyRow({
      brand: "Anker",
      model: "Anker Prime Cable",
      sku: "ANKER-CC-240",
      sourceUrl: "https://example.com/products/anker-c-c-240",
    });
    await insertReadyRow({
      brand: "Satechi",
      model: "Satechi USB4 Cable",
      sku: "SATECHI-CC-240",
      sourceUrl: "https://example.com/products/satechi-c-c-240",
    });

    const rows = await t.query(api.ingestQueries.getTopCables, {
      limit: 10,
      searchQuery: "ankre usbc to usbc",
    });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]?.brand).toBe("Anker");
  });

  it("boosts rows whose wattage matches requested power", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();

    const workflowRunId = await t.mutation(internal.ingestDb.createWorkflow, {
      allowedDomains: [],
      seedUrls: [
        "https://example.com/products/anker-c-c-240",
        "https://example.com/products/anker-c-c-100",
      ],
      startedAt: now,
      totalItems: 2,
    });

    const insertReadyRow = async (row: {
      maxWatts: number;
      sku: string;
      sourceUrl: string;
      variant: string;
    }) => {
      const sourceId = await t.mutation(
        internal.ingestDb.insertEvidenceSource,
        {
          workflowRunId,
          url: row.sourceUrl,
          canonicalUrl: row.sourceUrl,
          fetchedAt: now,
          contentHash: `${row.sku}-hash`,
          html: "<html></html>",
          markdown: "Anker Prime Cable",
          createdAt: now,
        }
      );

      await t.mutation(internal.ingestDb.upsertVariantAndInsertSpec, {
        workflowRunId,
        sourceUrl: row.sourceUrl,
        evidenceSourceId: sourceId,
        now,
        parsed: {
          brand: "Anker",
          model: "Anker Prime Cable",
          variant: row.variant,
          sku: row.sku,
          connectorPair: {
            from: "USB-C",
            to: "USB-C",
          },
          power: {
            maxWatts: row.maxWatts,
            pdSupported: true,
          },
          data: {},
          video: {},
          images: [{ url: `https://images.example.com/${row.sku}.jpg` }],
          evidence: createEvidenceRefs(row.sourceUrl),
        },
      });
    };

    await insertReadyRow({
      maxWatts: 100,
      sku: "ANKER-CC-100",
      variant: "1 m",
      sourceUrl: "https://example.com/products/anker-c-c-100",
    });
    await insertReadyRow({
      maxWatts: 240,
      sku: "ANKER-CC-240",
      variant: "2 m",
      sourceUrl: "https://example.com/products/anker-c-c-240",
    });

    const rows = await t.query(api.ingestQueries.getTopCables, {
      limit: 10,
      searchQuery: "anker usbc 240w",
    });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]?.power.maxWatts).toBe(240);
  });
});

import { describe, expect, it } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

const MODULE_FILE_REGEX = /\.[cm]?[jt]sx?$/;
const DECLARATION_FILE_SUFFIX = ".d.ts";
const EXPECT_TOTAL_ITEMS = 1;
const EXPECT_COMPLETED_ITEMS = 1;
const EXPECT_FAILED_ITEMS = 0;
const TOP_CABLE_LIMIT = 20;
const DEDUPE_TEST_TOP_CABLE_LIMIT = 80;
const TARGET_PRODUCT_SLUG = "a82e2-240w-usb-c-to-usb-c-cable";
const MIN_ANKER_ROWS = 4;
const EXPECTED_SKU = "A82E2011";
const OVERLAP_PRODUCT_SLUG_ONE = "a8662";
const OVERLAP_PRODUCT_SLUG_TWO = "a8663";
const TEST_TIMEOUT_MS = 180_000;

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

describe("shopify ingest integration", () => {
  it(
    "ingests Anker Shopify product URLs without AI/Firecrawl env keys",
    async () => {
      const previousAiGateway = process.env.AI_GATEWAY_API_KEY;
      const previousFirecrawl = process.env.FIRECRAWL_API_KEY;

      process.env.AI_GATEWAY_API_KEY = undefined;
      process.env.FIRECRAWL_API_KEY = undefined;

      try {
        const t = convexTest(schema, modules);

        const ingestResult = await t.action(api.ingest.runSeedIngest, {
          seedUrls: [
            "https://www.anker.com/products/a82e2-240w-usb-c-to-usb-c-cable",
          ],
        });

        expect(ingestResult.totalItems).toBe(EXPECT_TOTAL_ITEMS);
        expect(ingestResult.completedItems).toBe(EXPECT_COMPLETED_ITEMS);
        expect(ingestResult.failedItems).toBe(EXPECT_FAILED_ITEMS);

        const report = await t.query(api.ingestQueries.getWorkflowReport, {
          workflowRunId: ingestResult.workflowRunId,
          limit: TOP_CABLE_LIMIT,
        });

        const workflowRows = report.cables.filter((row) => {
          return row.productUrl?.includes(TARGET_PRODUCT_SLUG);
        });
        expect(workflowRows.length).toBeGreaterThan(MIN_ANKER_ROWS);

        const topCables = await t.query(api.ingestQueries.getTopCables, {
          limit: TOP_CABLE_LIMIT,
        });

        const ankerRows = topCables.filter((row) => {
          return row.productUrl?.includes(TARGET_PRODUCT_SLUG);
        });

        expect(ankerRows.length).toBeGreaterThan(MIN_ANKER_ROWS);
        expect(ankerRows.some((row) => row.sku === EXPECTED_SKU)).toBeTruthy();
        expect(ankerRows.every((row) => row.imageUrls.length > 0)).toBeTruthy();
      } finally {
        if (previousAiGateway !== undefined) {
          process.env.AI_GATEWAY_API_KEY = previousAiGateway;
        } else {
          process.env.AI_GATEWAY_API_KEY = undefined;
        }
        if (previousFirecrawl !== undefined) {
          process.env.FIRECRAWL_API_KEY = previousFirecrawl;
        } else {
          process.env.FIRECRAWL_API_KEY = undefined;
        }
      }
    },
    TEST_TIMEOUT_MS
  );

  it(
    "dedupes brand+sku rows across overlapping product URLs in top cables",
    async () => {
      const t = convexTest(schema, modules);

      const ingestResult = await t.action(api.ingest.runSeedIngest, {
        seedUrls: [
          `https://www.anker.com/products/${OVERLAP_PRODUCT_SLUG_ONE}`,
          `https://www.anker.com/products/${OVERLAP_PRODUCT_SLUG_TWO}`,
        ],
      });

      expect(ingestResult.completedItems).toBe(2);
      expect(ingestResult.failedItems).toBe(0);

      const topCables = await t.query(api.ingestQueries.getTopCables, {
        limit: DEDUPE_TEST_TOP_CABLE_LIMIT,
      });
      const workflowReport = await t.query(
        api.ingestQueries.getWorkflowReport,
        {
          workflowRunId: ingestResult.workflowRunId,
          limit: DEDUPE_TEST_TOP_CABLE_LIMIT,
        }
      );
      const overlapRows = topCables.filter((row) => {
        return (
          row.productUrl?.includes(OVERLAP_PRODUCT_SLUG_ONE) ||
          row.productUrl?.includes(OVERLAP_PRODUCT_SLUG_TWO)
        );
      });

      const skuCounts = new Map<string, number>();
      for (const row of overlapRows) {
        const sku = row.sku?.trim();
        if (!sku) {
          continue;
        }
        skuCounts.set(sku, (skuCounts.get(sku) ?? 0) + 1);
      }

      expect(skuCounts.size).toBeGreaterThan(0);
      expect(
        [...skuCounts.values()].every((count) => count === 1)
      ).toBeTruthy();

      const duplicateWorkflowRows = workflowReport.cables.filter((row) => {
        return (
          row.sourceUrl.includes(OVERLAP_PRODUCT_SLUG_TWO) &&
          row.sku &&
          row.sku.trim() !== ""
        );
      });
      const workflowSkuCounts = new Map<string, number>();
      for (const row of duplicateWorkflowRows) {
        const sku = row.sku?.trim();
        if (!sku) {
          continue;
        }
        workflowSkuCounts.set(sku, (workflowSkuCounts.get(sku) ?? 0) + 1);
      }
      expect(
        [...workflowSkuCounts.values()].every((count) => count === 1)
      ).toBeTruthy();
    },
    TEST_TIMEOUT_MS
  );
});

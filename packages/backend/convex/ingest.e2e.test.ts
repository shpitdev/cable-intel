import { describe, expect, it } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
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
const hasLiveProviderKeys = Boolean(
  process.env.AI_GATEWAY_API_KEY && process.env.FIRECRAWL_API_KEY
);

const LIVE_TEST_URLS = [
  "https://www.anker.com/products/a82e2-240w-usb-c-to-usb-c-cable",
  "https://www.apple.com/shop/product/MYQT3AM/A/240w-usb-c-charge-cable-2-m",
];

describe("ingest live e2e", () => {
  it("ingests real pages through Firecrawl and AI Gateway", async () => {
    if (!hasLiveProviderKeys) {
      return;
    }

    const t = convexTest(schema, modules);

    const ingestResult = await t.action(api.ingest.runSeedIngest, {
      seedUrls: LIVE_TEST_URLS,
      maxItems: LIVE_TEST_URLS.length,
    });

    expect(ingestResult.totalItems).toBe(LIVE_TEST_URLS.length);
    expect(ingestResult.completedItems).toBeGreaterThan(0);
    expect(ingestResult.status).toBeDefined();

    const report = await t.query(api.ingestQueries.getWorkflowReport, {
      workflowRunId: ingestResult.workflowRunId,
      limit: 10,
    });

    expect(report.workflow._id).toBe(ingestResult.workflowRunId);
    expect(report.cables.length).toBeGreaterThan(0);

    const firstCable = report.cables[0];
    expect(firstCable.brand.length).toBeGreaterThan(0);
    expect(firstCable.model.length).toBeGreaterThan(0);
    expect(firstCable.connectorFrom.length).toBeGreaterThan(0);
    expect(firstCable.connectorTo.length).toBeGreaterThan(0);
    expect(firstCable.evidenceRefs.length).toBeGreaterThan(0);
    expect(firstCable.evidenceSources.length).toBeGreaterThan(0);
  }, 180_000);

  it("keeps the run moving when one URL fails and others are valid", async () => {
    if (!hasLiveProviderKeys) {
      return;
    }

    const t = convexTest(schema, modules);

    const ingestResult = await t.action(api.ingest.runSeedIngest, {
      seedUrls: [
        LIVE_TEST_URLS[0],
        "https://this-domain-should-not-exist.invalid/cable",
      ],
    });

    expect(ingestResult.totalItems).toBe(2);
    expect(ingestResult.completedItems).toBeGreaterThanOrEqual(1);
    expect(ingestResult.failedItems).toBeGreaterThanOrEqual(1);

    const report = await t.query(api.ingestQueries.getWorkflowReport, {
      workflowRunId: ingestResult.workflowRunId,
      limit: 10,
    });

    expect(report.cables.length).toBeGreaterThanOrEqual(1);
    expect(report.failedItems.length).toBeGreaterThanOrEqual(1);
  }, 180_000);
});

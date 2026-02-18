import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { type QueryCtx, query } from "./_generated/server";

const scoreSpecCompleteness = (spec: {
  power: {
    maxWatts?: number;
    pdSupported?: boolean;
    eprSupported?: boolean;
  };
  data: {
    usbGeneration?: string;
    maxGbps?: number;
  };
  video: {
    explicitlySupported?: boolean;
    maxResolution?: string;
    maxRefreshHz?: number;
  };
  evidenceRefs: {
    fieldPath: string;
    sourceId: Id<"evidenceSources">;
    snippet?: string;
  }[];
}): number => {
  let score = 0;

  if (typeof spec.power.maxWatts === "number") {
    score += 5;
  }
  if (typeof spec.power.pdSupported === "boolean") {
    score += 2;
  }
  if (typeof spec.power.eprSupported === "boolean") {
    score += 1;
  }
  if (typeof spec.data.maxGbps === "number") {
    score += 4;
  }
  if (spec.data.usbGeneration) {
    score += 3;
  }
  if (typeof spec.video.explicitlySupported === "boolean") {
    score += 2;
  }
  if (spec.video.maxResolution) {
    score += 1;
  }
  if (typeof spec.video.maxRefreshHz === "number") {
    score += 1;
  }
  if (spec.evidenceRefs.length > 0) {
    score += 1;
  }

  return score;
};

interface TopCableRow {
  brand: string;
  connectorFrom: string;
  connectorTo: string;
  data: {
    usbGeneration?: string;
    maxGbps?: number;
  };
  evidenceRefs: {
    fieldPath: string;
    sourceId: Id<"evidenceSources">;
    snippet?: string;
  }[];
  imageUrls: string[];
  model: string;
  normalizedSpecId: Id<"normalizedSpecs">;
  power: {
    maxWatts?: number;
    pdSupported?: boolean;
    eprSupported?: boolean;
  };
  productUrl?: string;
  sku?: string;
  sources: {
    sourceId: Id<"evidenceSources">;
    url: string;
    canonicalUrl: string;
    fetchedAt: number;
  }[];
  variant?: string;
  variantId: Id<"cableVariants">;
  video: {
    explicitlySupported?: boolean;
    maxResolution?: string;
    maxRefreshHz?: number;
  };
  workflowRunId: Id<"ingestionWorkflows">;
}

const pickBestSpecsByVariant = (
  specs: Doc<"normalizedSpecs">[],
  scanLimit: number
): Doc<"normalizedSpecs">[] => {
  const bestSpecByVariant = new Map<
    string,
    {
      score: number;
      spec: Doc<"normalizedSpecs">;
    }
  >();

  for (const spec of specs) {
    const key = spec.variantId;
    const score = scoreSpecCompleteness(spec);
    const existing = bestSpecByVariant.get(key);

    if (!existing || score > existing.score) {
      bestSpecByVariant.set(key, { spec, score });
      continue;
    }

    if (
      score === existing.score &&
      spec._creationTime > existing.spec._creationTime
    ) {
      bestSpecByVariant.set(key, { spec, score });
    }
  }

  return [...bestSpecByVariant.values()]
    .map((entry) => entry.spec)
    .sort((left, right) => right._creationTime - left._creationTime)
    .slice(0, scanLimit);
};

const hydrateTopCableRows = async (
  ctx: QueryCtx,
  rankedSpecs: Doc<"normalizedSpecs">[]
): Promise<TopCableRow[]> => {
  const rows: TopCableRow[] = [];

  for (const spec of rankedSpecs) {
    const variant = await ctx.db.get(spec.variantId);
    if (!variant) {
      continue;
    }

    const sources: TopCableRow["sources"] = [];
    for (const sourceId of spec.evidenceSourceIds) {
      const source = await ctx.db.get(sourceId);
      if (!source) {
        continue;
      }
      sources.push({
        sourceId: source._id,
        url: source.url,
        canonicalUrl: source.canonicalUrl,
        fetchedAt: source.fetchedAt,
      });
    }

    rows.push({
      normalizedSpecId: spec._id,
      workflowRunId: spec.workflowRunId,
      variantId: variant._id,
      brand: variant.brand,
      model: variant.model,
      variant: variant.variant,
      sku: variant.sku,
      connectorFrom: variant.connectorFrom,
      connectorTo: variant.connectorTo,
      productUrl: variant.productUrl,
      imageUrls: variant.imageUrls,
      power: spec.power,
      data: spec.data,
      video: spec.video,
      evidenceRefs: spec.evidenceRefs,
      sources,
    });
  }

  return rows;
};

const normalizeToken = (value?: string): string => {
  return value?.trim().toLowerCase() ?? "";
};

const isDescriptiveModel = (value: string): boolean => {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  const normalized = trimmed.toLowerCase();
  return (
    trimmed.includes(" ") ||
    normalized.includes("usb") ||
    normalized.includes("cable")
  );
};

const hasSpecificVariantSignals = (row: TopCableRow): boolean => {
  return Boolean(row.sku?.trim() || row.variant?.trim());
};

const pruneLegacyCatalogRows = (rows: TopCableRow[]): TopCableRow[] => {
  const grouped = new Map<string, TopCableRow[]>();
  for (const row of rows) {
    const groupingKey =
      normalizeToken(row.productUrl) ||
      [
        normalizeToken(row.brand),
        normalizeToken(row.connectorFrom),
        normalizeToken(row.connectorTo),
      ].join("::");
    const existing = grouped.get(groupingKey);
    if (existing) {
      existing.push(row);
    } else {
      grouped.set(groupingKey, [row]);
    }
  }

  const cleaned: TopCableRow[] = [];
  for (const groupRows of grouped.values()) {
    const hasSpecificRows = groupRows.some(hasSpecificVariantSignals);
    const descriptiveModels = groupRows
      .map((row) => row.model.trim())
      .filter((model) => isDescriptiveModel(model))
      .sort((left, right) => right.length - left.length);
    const preferredModel = descriptiveModels[0];

    for (const row of groupRows) {
      if (hasSpecificRows && !hasSpecificVariantSignals(row)) {
        continue;
      }

      if (
        preferredModel &&
        row.model.trim() !== preferredModel &&
        !isDescriptiveModel(row.model)
      ) {
        continue;
      }

      cleaned.push(row);
    }
  }

  return cleaned;
};

interface WorkflowReport {
  cables: {
    workflowItemId: Id<"ingestionWorkflowItems">;
    sourceUrl: string;
    canonicalUrl: string;
    brand: string;
    model: string;
    variant?: string;
    sku?: string;
    connectorFrom: string;
    connectorTo: string;
    productUrl?: string;
    imageUrls: string[];
    power: {
      maxWatts?: number;
      pdSupported?: boolean;
      eprSupported?: boolean;
    };
    data: {
      usbGeneration?: string;
      maxGbps?: number;
    };
    video: {
      explicitlySupported?: boolean;
      maxResolution?: string;
      maxRefreshHz?: number;
    };
    evidenceRefs: {
      fieldPath: string;
      sourceId: Id<"evidenceSources">;
      snippet?: string;
    }[];
    evidenceSources: {
      sourceId: Id<"evidenceSources">;
      url: string;
      canonicalUrl: string;
      fetchedAt: number;
      contentHash: string;
    }[];
  }[];
  failedItems: {
    workflowItemId: Id<"ingestionWorkflowItems">;
    url: string;
    canonicalUrl: string;
    lastError?: string;
  }[];
  workflow: {
    _id: Id<"ingestionWorkflows">;
    _creationTime: number;
    allowedDomains: string[];
    completedItems: number;
    failedItems: number;
    finishedAt?: number;
    lastError?: string;
    seedUrls: string[];
    startedAt: number;
    status: "completed" | "failed" | "running";
    totalItems: number;
  };
}

const buildWorkflowReport = async (
  ctx: QueryCtx,
  workflowRunId: Id<"ingestionWorkflows">,
  limit: number
): Promise<WorkflowReport> => {
  const workflow = await ctx.db.get(workflowRunId);
  if (!workflow) {
    throw new Error(`Workflow not found: ${workflowRunId}`);
  }

  const completedItems = await ctx.db
    .query("ingestionWorkflowItems")
    .withIndex("by_workflow_status", (q) =>
      q.eq("workflowRunId", workflowRunId).eq("status", "completed")
    )
    .collect();
  const failedItems = await ctx.db
    .query("ingestionWorkflowItems")
    .withIndex("by_workflow_status", (q) =>
      q.eq("workflowRunId", workflowRunId).eq("status", "failed")
    )
    .collect();

  const cableRows: WorkflowReport["cables"] = [];
  for (const item of completedItems.slice(0, limit)) {
    if (!item.normalizedSpecId) {
      continue;
    }

    const normalizedSpec = await ctx.db.get(item.normalizedSpecId);
    if (!normalizedSpec) {
      continue;
    }
    const variant = await ctx.db.get(normalizedSpec.variantId);
    if (!variant) {
      continue;
    }

    const evidenceSources: WorkflowReport["cables"][number]["evidenceSources"] =
      [];
    for (const sourceId of normalizedSpec.evidenceSourceIds) {
      const source = await ctx.db.get(sourceId);
      if (source) {
        evidenceSources.push({
          sourceId: source._id,
          url: source.url,
          canonicalUrl: source.canonicalUrl,
          fetchedAt: source.fetchedAt,
          contentHash: source.contentHash,
        });
      }
    }

    cableRows.push({
      workflowItemId: item._id,
      sourceUrl: item.url,
      canonicalUrl: item.canonicalUrl,
      brand: variant.brand,
      model: variant.model,
      variant: variant.variant,
      sku: variant.sku,
      connectorFrom: variant.connectorFrom,
      connectorTo: variant.connectorTo,
      productUrl: variant.productUrl,
      imageUrls: variant.imageUrls,
      power: normalizedSpec.power,
      data: normalizedSpec.data,
      video: normalizedSpec.video,
      evidenceRefs: normalizedSpec.evidenceRefs,
      evidenceSources,
    });
  }

  return {
    workflow,
    cables: cableRows,
    failedItems: failedItems.map((item) => ({
      workflowItemId: item._id,
      url: item.url,
      canonicalUrl: item.canonicalUrl,
      lastError: item.lastError,
    })),
  };
};

export const getWorkflowReport = query({
  args: {
    workflowRunId: v.id("ingestionWorkflows"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const effectiveLimit = Math.max(args.limit ?? 10, 0);
    return await buildWorkflowReport(ctx, args.workflowRunId, effectiveLimit);
  },
});

export const getLatestWorkflowReport = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<WorkflowReport | null> => {
    const latestWorkflow = await ctx.db
      .query("ingestionWorkflows")
      .withIndex("by_started_at")
      .order("desc")
      .first();

    if (!latestWorkflow) {
      return null;
    }

    const effectiveLimit = Math.max(args.limit ?? 10, 0);
    return await buildWorkflowReport(ctx, latestWorkflow._id, effectiveLimit);
  },
});

export const getTopCables = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(args.limit ?? 10, 0);
    const scanLimit = Math.max(limit * 40, limit);
    const specs = await ctx.db
      .query("normalizedSpecs")
      .order("desc")
      .take(scanLimit);
    const rankedSpecs = pickBestSpecsByVariant(specs, scanLimit);
    const hydratedRows = await hydrateTopCableRows(ctx, rankedSpecs);
    const cleanedRows = pruneLegacyCatalogRows(hydratedRows);
    return cleanedRows.slice(0, limit);
  },
});

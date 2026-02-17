import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { type QueryCtx, query } from "./_generated/server";

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
    const specs = await ctx.db
      .query("normalizedSpecs")
      .order("desc")
      .take(Math.max(limit * 5, limit));

    const cables: Array<{
      normalizedSpecId: Id<"normalizedSpecs">;
      workflowRunId: Id<"ingestionWorkflows">;
      variantId: Id<"cableVariants">;
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
      sources: {
        sourceId: Id<"evidenceSources">;
        url: string;
        canonicalUrl: string;
        fetchedAt: number;
      }[];
    }> = [];
    const seenVariantIds = new Set<string>();

    for (const spec of specs) {
      if (cables.length >= limit) {
        break;
      }
      if (seenVariantIds.has(spec.variantId)) {
        continue;
      }

      const variant = await ctx.db.get(spec.variantId);
      if (!variant) {
        continue;
      }

      const sources: Array<{
        sourceId: Id<"evidenceSources">;
        url: string;
        canonicalUrl: string;
        fetchedAt: number;
      }> = [];
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

      seenVariantIds.add(spec.variantId);
      cables.push({
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

    return cables;
  },
});

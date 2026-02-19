import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "./_generated/server";
import { assessCatalogQuality } from "./catalogQuality";

const workflowItemStatusValidator = v.union(
  v.literal("pending"),
  v.literal("in_progress"),
  v.literal("completed"),
  v.literal("failed")
);

const enrichmentJobStatusValidator = v.union(
  v.literal("pending"),
  v.literal("in_progress"),
  v.literal("completed"),
  v.literal("failed")
);

const parsedCableValidator = v.object({
  brand: v.string(),
  model: v.string(),
  variant: v.optional(v.string()),
  sku: v.optional(v.string()),
  connectorPair: v.object({
    from: v.string(),
    to: v.string(),
  }),
  power: v.object({
    maxWatts: v.optional(v.number()),
    pdSupported: v.optional(v.boolean()),
    eprSupported: v.optional(v.boolean()),
  }),
  data: v.object({
    usbGeneration: v.optional(v.string()),
    maxGbps: v.optional(v.number()),
  }),
  video: v.object({
    explicitlySupported: v.optional(v.boolean()),
    maxResolution: v.optional(v.string()),
    maxRefreshHz: v.optional(v.number()),
  }),
  images: v.array(
    v.object({
      url: v.string(),
      alt: v.optional(v.string()),
    })
  ),
  evidence: v.array(
    v.object({
      fieldPath: v.string(),
      sourceUrl: v.string(),
      sourceContentHash: v.optional(v.string()),
      snippet: v.optional(v.string()),
    })
  ),
});

const areValuesEqual = (left?: string, right?: string): boolean => {
  return (left ?? undefined) === (right ?? undefined);
};

const mergeUniqueStrings = (
  left: readonly string[],
  right: readonly string[]
): string[] => {
  return [...new Set([...left, ...right])];
};

const MODEL_LENGTH_TOKEN_REGEX =
  /\b\d+(?:\.\d+)?\s*(?:ft|feet|m|meter|meters)\b/i;

const normalizeToken = (value?: string): string => {
  return value?.trim().toLowerCase() ?? "";
};

const hasLengthToken = (value: string): boolean => {
  return MODEL_LENGTH_TOKEN_REGEX.test(value);
};

const pickPreferredModel = (current: string, incoming: string): string => {
  const trimmedCurrent = current.trim();
  const trimmedIncoming = incoming.trim();
  if (!trimmedCurrent) {
    return trimmedIncoming;
  }
  if (!trimmedIncoming) {
    return trimmedCurrent;
  }
  if (trimmedCurrent === trimmedIncoming) {
    return trimmedCurrent;
  }

  const currentHasLengthToken = hasLengthToken(trimmedCurrent);
  const incomingHasLengthToken = hasLengthToken(trimmedIncoming);
  if (currentHasLengthToken !== incomingHasLengthToken) {
    return incomingHasLengthToken ? trimmedCurrent : trimmedIncoming;
  }

  return trimmedIncoming.length > trimmedCurrent.length
    ? trimmedIncoming
    : trimmedCurrent;
};

const isSkuPlaceholderVariant = (variant?: string, sku?: string): boolean => {
  const normalizedVariant = normalizeToken(variant);
  const normalizedSku = normalizeToken(sku);
  return Boolean(
    normalizedVariant && normalizedSku && normalizedVariant === normalizedSku
  );
};

const pickPreferredVariant = (
  currentVariant?: string,
  incomingVariant?: string,
  sku?: string
): string | undefined => {
  if (!currentVariant) {
    return incomingVariant;
  }
  if (!incomingVariant) {
    return currentVariant;
  }
  if (currentVariant === incomingVariant) {
    return currentVariant;
  }

  const currentIsPlaceholder = isSkuPlaceholderVariant(currentVariant, sku);
  const incomingIsPlaceholder = isSkuPlaceholderVariant(incomingVariant, sku);
  if (currentIsPlaceholder !== incomingIsPlaceholder) {
    return incomingIsPlaceholder ? currentVariant : incomingVariant;
  }

  return incomingVariant.length > currentVariant.length
    ? incomingVariant
    : currentVariant;
};

const hasSameConnectors = (
  variant: Doc<"cableVariants">,
  connectorFrom: string,
  connectorTo: string
): boolean => {
  return (
    variant.connectorFrom === connectorFrom &&
    variant.connectorTo === connectorTo
  );
};

const pickNewestVariant = (
  variants: Doc<"cableVariants">[]
): Doc<"cableVariants"> | undefined => {
  return variants.sort((left, right) => {
    if (left.updatedAt !== right.updatedAt) {
      return right.updatedAt - left.updatedAt;
    }
    return right._creationTime - left._creationTime;
  })[0];
};

const getOpenEnrichmentJob = async (
  ctx: MutationCtx,
  variantId: Id<"cableVariants">
): Promise<Doc<"catalogEnrichmentJobs"> | null> => {
  const pendingJob = await ctx.db
    .query("catalogEnrichmentJobs")
    .withIndex("by_variant_status", (q) =>
      q.eq("variantId", variantId).eq("status", "pending")
    )
    .first();
  if (pendingJob) {
    return pendingJob;
  }
  return await ctx.db
    .query("catalogEnrichmentJobs")
    .withIndex("by_variant_status", (q) =>
      q.eq("variantId", variantId).eq("status", "in_progress")
    )
    .first();
};

const ensurePendingEnrichmentJob = async (
  ctx: MutationCtx,
  args: {
    now: number;
    reason: string | undefined;
    variantId: Id<"cableVariants">;
    workflowRunId: Id<"ingestionWorkflows">;
  }
): Promise<void> => {
  const openJob = await getOpenEnrichmentJob(ctx, args.variantId);
  if (openJob) {
    await ctx.db.patch(openJob._id, {
      reason: args.reason ?? openJob.reason,
      updatedAt: args.now,
      workflowRunId: args.workflowRunId,
    });
    return;
  }

  const latestFailedJob = await ctx.db
    .query("catalogEnrichmentJobs")
    .withIndex("by_variant_status", (q) =>
      q.eq("variantId", args.variantId).eq("status", "failed")
    )
    .order("desc")
    .first();
  if (latestFailedJob) {
    await ctx.db.patch(latestFailedJob._id, {
      status: "pending",
      reason: args.reason ?? latestFailedJob.reason,
      lastError: undefined,
      updatedAt: args.now,
      workflowRunId: args.workflowRunId,
      completedAt: undefined,
    });
    return;
  }

  await ctx.db.insert("catalogEnrichmentJobs", {
    variantId: args.variantId,
    workflowRunId: args.workflowRunId,
    status: "pending",
    reason: args.reason,
    attemptCount: 0,
    createdAt: args.now,
    updatedAt: args.now,
  });
};

const completeOpenEnrichmentJobs = async (
  ctx: MutationCtx,
  variantId: Id<"cableVariants">,
  now: number
): Promise<void> => {
  const pendingJobs = await ctx.db
    .query("catalogEnrichmentJobs")
    .withIndex("by_variant_status", (q) =>
      q.eq("variantId", variantId).eq("status", "pending")
    )
    .collect();
  const inProgressJobs = await ctx.db
    .query("catalogEnrichmentJobs")
    .withIndex("by_variant_status", (q) =>
      q.eq("variantId", variantId).eq("status", "in_progress")
    )
    .collect();

  for (const job of [...pendingJobs, ...inProgressJobs]) {
    await ctx.db.patch(job._id, {
      status: "completed",
      reason: undefined,
      lastError: undefined,
      updatedAt: now,
      completedAt: now,
    });
  }
};

export const createWorkflow = internalMutation({
  args: {
    allowedDomains: v.array(v.string()),
    seedUrls: v.array(v.string()),
    startedAt: v.number(),
    totalItems: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("ingestionWorkflows", {
      status: "running",
      allowedDomains: args.allowedDomains,
      seedUrls: args.seedUrls,
      startedAt: args.startedAt,
      totalItems: args.totalItems,
      completedItems: 0,
      failedItems: 0,
    });
  },
});

export const createWorkflowItems = internalMutation({
  args: {
    workflowRunId: v.id("ingestionWorkflows"),
    urls: v.array(v.string()),
    createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    const itemIds: Id<"ingestionWorkflowItems">[] = [];
    for (const url of args.urls) {
      const itemId = await ctx.db.insert("ingestionWorkflowItems", {
        workflowRunId: args.workflowRunId,
        url,
        canonicalUrl: url,
        status: "pending",
        attemptCount: 0,
        createdAt: args.createdAt,
        updatedAt: args.createdAt,
      });
      itemIds.push(itemId);
    }
    return itemIds;
  },
});

export const updateWorkflowItemStatus = internalMutation({
  args: {
    itemId: v.id("ingestionWorkflowItems"),
    status: workflowItemStatusValidator,
    now: v.number(),
    lastError: v.optional(v.string()),
    evidenceSourceId: v.optional(v.id("evidenceSources")),
    normalizedSpecId: v.optional(v.id("normalizedSpecs")),
    incrementAttemptCount: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) {
      throw new Error(`Workflow item not found: ${args.itemId}`);
    }

    const nextAttemptCount =
      args.incrementAttemptCount === true
        ? item.attemptCount + 1
        : item.attemptCount;

    await ctx.db.patch(args.itemId, {
      status: args.status,
      attemptCount: nextAttemptCount,
      updatedAt: args.now,
      completedAt: args.status === "completed" ? args.now : item.completedAt,
      lastError: args.lastError,
      evidenceSourceId: args.evidenceSourceId ?? item.evidenceSourceId,
      normalizedSpecId: args.normalizedSpecId ?? item.normalizedSpecId,
    });

    if (args.status === "completed" || args.status === "failed") {
      const workflow = await ctx.db.get(item.workflowRunId);
      if (!workflow) {
        throw new Error(`Workflow not found: ${item.workflowRunId}`);
      }

      if (args.status === "completed") {
        await ctx.db.patch(item.workflowRunId, {
          completedItems: workflow.completedItems + 1,
        });
      } else {
        await ctx.db.patch(item.workflowRunId, {
          failedItems: workflow.failedItems + 1,
        });
      }
    }
  },
});

export const finalizeWorkflow = internalMutation({
  args: {
    workflowRunId: v.id("ingestionWorkflows"),
    finishedAt: v.number(),
    lastError: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const workflow = await ctx.db.get(args.workflowRunId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${args.workflowRunId}`);
    }

    await ctx.db.patch(args.workflowRunId, {
      status: workflow.failedItems > 0 ? "failed" : "completed",
      finishedAt: args.finishedAt,
      lastError: args.lastError,
    });
  },
});

export const insertEvidenceSource = internalMutation({
  args: {
    workflowRunId: v.id("ingestionWorkflows"),
    url: v.string(),
    canonicalUrl: v.string(),
    fetchedAt: v.number(),
    contentHash: v.string(),
    html: v.string(),
    markdown: v.string(),
    createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("evidenceSources", args);
  },
});

export const upsertVariantAndInsertSpec = internalMutation({
  args: {
    workflowRunId: v.id("ingestionWorkflows"),
    sourceUrl: v.string(),
    evidenceSourceId: v.id("evidenceSources"),
    parsed: parsedCableValidator,
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const parsedImageUrls = args.parsed.images.map((image) => image.url);
    const parsedEvidenceRefs = args.parsed.evidence.map((evidence) => ({
      fieldPath: evidence.fieldPath,
      sourceId: args.evidenceSourceId,
      snippet: evidence.snippet,
    }));
    const matchingVariantsBySku = args.parsed.sku
      ? await ctx.db
          .query("cableVariants")
          .withIndex("by_brand_sku", (q) =>
            q.eq("brand", args.parsed.brand).eq("sku", args.parsed.sku)
          )
          .collect()
      : [];
    const existingVariantBySku = pickNewestVariant(
      matchingVariantsBySku.filter((variant) =>
        hasSameConnectors(
          variant,
          args.parsed.connectorPair.from,
          args.parsed.connectorPair.to
        )
      )
    );

    const matchingVariantsByModel = await ctx.db
      .query("cableVariants")
      .withIndex("by_brand_model", (q) =>
        q.eq("brand", args.parsed.brand).eq("model", args.parsed.model)
      )
      .collect();

    const existingVariantByModel = matchingVariantsByModel.find((variant) => {
      return (
        areValuesEqual(variant.variant, args.parsed.variant) &&
        areValuesEqual(variant.sku, args.parsed.sku) &&
        hasSameConnectors(
          variant,
          args.parsed.connectorPair.from,
          args.parsed.connectorPair.to
        )
      );
    });
    const existingVariant = existingVariantBySku ?? existingVariantByModel;

    let variantId = existingVariant?._id;
    let nextModel = args.parsed.model;
    let nextVariant = args.parsed.variant;
    let nextSku = args.parsed.sku;
    let nextProductUrl = args.sourceUrl;
    let nextImageUrls = parsedImageUrls;

    if (existingVariant) {
      nextImageUrls = mergeUniqueStrings(
        existingVariant.imageUrls,
        parsedImageUrls
      );
      nextModel = pickPreferredModel(existingVariant.model, args.parsed.model);
      nextSku = existingVariant.sku ?? args.parsed.sku;
      nextVariant = pickPreferredVariant(
        existingVariant.variant,
        args.parsed.variant,
        nextSku
      );
      nextProductUrl = existingVariant.productUrl ?? args.sourceUrl;
    }

    const qualityAssessment = assessCatalogQuality({
      brand: args.parsed.brand,
      model: nextModel,
      connectorFrom: args.parsed.connectorPair.from,
      connectorTo: args.parsed.connectorPair.to,
      productUrl: nextProductUrl,
      imageUrls: nextImageUrls,
      power: args.parsed.power,
      evidenceRefs: parsedEvidenceRefs,
    });

    if (existingVariant) {
      await ctx.db.patch(existingVariant._id, {
        model: nextModel,
        variant: nextVariant,
        sku: nextSku,
        productUrl: nextProductUrl,
        imageUrls: nextImageUrls,
        qualityState: qualityAssessment.state,
        qualityIssues: qualityAssessment.issues,
        qualityUpdatedAt: args.now,
        updatedAt: args.now,
      });
    } else {
      variantId = await ctx.db.insert("cableVariants", {
        brand: args.parsed.brand,
        model: args.parsed.model,
        variant: args.parsed.variant,
        sku: args.parsed.sku,
        connectorFrom: args.parsed.connectorPair.from,
        connectorTo: args.parsed.connectorPair.to,
        productUrl: nextProductUrl,
        imageUrls: nextImageUrls,
        qualityState: qualityAssessment.state,
        qualityIssues: qualityAssessment.issues,
        qualityUpdatedAt: args.now,
        createdAt: args.now,
        updatedAt: args.now,
      });
    }

    if (!variantId) {
      throw new Error("Failed to resolve cable variant ID");
    }

    const normalizedSpecId = await ctx.db.insert("normalizedSpecs", {
      workflowRunId: args.workflowRunId,
      variantId,
      evidenceSourceIds: [args.evidenceSourceId],
      power: args.parsed.power,
      data: args.parsed.data,
      video: args.parsed.video,
      evidenceRefs: parsedEvidenceRefs,
      createdAt: args.now,
      updatedAt: args.now,
    });

    if (qualityAssessment.state === "needs_enrichment") {
      await ensurePendingEnrichmentJob(ctx, {
        variantId,
        workflowRunId: args.workflowRunId,
        reason: qualityAssessment.issues[0],
        now: args.now,
      });
    } else {
      await completeOpenEnrichmentJobs(ctx, variantId, args.now);
    }

    return {
      normalizedSpecId,
      variantId,
      qualityState: qualityAssessment.state,
      qualityIssues: qualityAssessment.issues,
    };
  },
});

export const listEnrichmentJobsByStatus = internalQuery({
  args: {
    status: enrichmentJobStatusValidator,
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(args.limit ?? 10, 0);
    return await ctx.db
      .query("catalogEnrichmentJobs")
      .withIndex("by_status", (q) => q.eq("status", args.status))
      .order("asc")
      .take(limit);
  },
});

export const getVariantForEnrichment = internalQuery({
  args: {
    variantId: v.id("cableVariants"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.variantId);
  },
});

export const updateEnrichmentJobStatus = internalMutation({
  args: {
    jobId: v.id("catalogEnrichmentJobs"),
    status: enrichmentJobStatusValidator,
    now: v.number(),
    workflowRunId: v.optional(v.id("ingestionWorkflows")),
    lastError: v.optional(v.string()),
    incrementAttemptCount: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) {
      throw new Error(`Enrichment job not found: ${args.jobId}`);
    }

    const nextAttemptCount =
      args.incrementAttemptCount === true
        ? job.attemptCount + 1
        : job.attemptCount;
    const isTerminal = args.status === "completed" || args.status === "failed";

    await ctx.db.patch(args.jobId, {
      status: args.status,
      attemptCount: nextAttemptCount,
      updatedAt: args.now,
      lastError: args.lastError,
      workflowRunId: args.workflowRunId ?? job.workflowRunId,
      completedAt: isTerminal ? args.now : undefined,
    });
  },
});

export const getWorkflowStatus = internalQuery({
  args: {
    workflowRunId: v.id("ingestionWorkflows"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.workflowRunId);
  },
});

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const workflowStatusValidator = v.union(
  v.literal("running"),
  v.literal("completed"),
  v.literal("failed")
);

const workflowItemStatusValidator = v.union(
  v.literal("pending"),
  v.literal("in_progress"),
  v.literal("completed"),
  v.literal("failed")
);

const visibilityValidator = v.union(
  v.literal("private"),
  v.literal("shared"),
  v.literal("public")
);

const powerCapabilityValidator = v.object({
  maxWatts: v.optional(v.number()),
  pdSupported: v.optional(v.boolean()),
  eprSupported: v.optional(v.boolean()),
});

const dataCapabilityValidator = v.object({
  usbGeneration: v.optional(v.string()),
  maxGbps: v.optional(v.number()),
});

const videoCapabilityValidator = v.object({
  explicitlySupported: v.optional(v.boolean()),
  maxResolution: v.optional(v.string()),
  maxRefreshHz: v.optional(v.number()),
});

const evidenceRefValidator = v.object({
  fieldPath: v.string(),
  sourceId: v.id("evidenceSources"),
  snippet: v.optional(v.string()),
});

export default defineSchema({
  ingestionWorkflows: defineTable({
    status: workflowStatusValidator,
    allowedDomains: v.array(v.string()),
    seedUrls: v.array(v.string()),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    totalItems: v.number(),
    completedItems: v.number(),
    failedItems: v.number(),
    lastError: v.optional(v.string()),
  })
    .index("by_status", ["status"])
    .index("by_started_at", ["startedAt"]),

  ingestionWorkflowItems: defineTable({
    workflowRunId: v.id("ingestionWorkflows"),
    url: v.string(),
    canonicalUrl: v.string(),
    status: workflowItemStatusValidator,
    attemptCount: v.number(),
    evidenceSourceId: v.optional(v.id("evidenceSources")),
    normalizedSpecId: v.optional(v.id("normalizedSpecs")),
    lastError: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_workflow", ["workflowRunId"])
    .index("by_workflow_status", ["workflowRunId", "status"])
    .index("by_canonical_url", ["canonicalUrl"]),

  evidenceSources: defineTable({
    workflowRunId: v.id("ingestionWorkflows"),
    url: v.string(),
    canonicalUrl: v.string(),
    fetchedAt: v.number(),
    contentHash: v.string(),
    html: v.string(),
    markdown: v.string(),
    createdAt: v.number(),
  })
    .index("by_workflow", ["workflowRunId"])
    .index("by_canonical_url", ["canonicalUrl"])
    .index("by_content_hash", ["contentHash"]),

  cableVariants: defineTable({
    brand: v.string(),
    model: v.string(),
    variant: v.optional(v.string()),
    sku: v.optional(v.string()),
    connectorFrom: v.string(),
    connectorTo: v.string(),
    productUrl: v.optional(v.string()),
    imageUrls: v.array(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_brand_model", ["brand", "model"])
    .index("by_connector_pair", ["connectorFrom", "connectorTo"])
    .index("by_product_url", ["productUrl"]),

  normalizedSpecs: defineTable({
    workflowRunId: v.id("ingestionWorkflows"),
    variantId: v.id("cableVariants"),
    evidenceSourceIds: v.array(v.id("evidenceSources")),
    power: powerCapabilityValidator,
    data: dataCapabilityValidator,
    video: videoCapabilityValidator,
    evidenceRefs: v.array(evidenceRefValidator),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_variant", ["variantId"])
    .index("by_workflow", ["workflowRunId"]),

  userOwnedCables: defineTable({
    userId: v.string(),
    variantId: v.id("cableVariants"),
    normalizedSpecId: v.optional(v.id("normalizedSpecs")),
    condition: v.optional(v.string()),
    notes: v.optional(v.string()),
    visibility: v.optional(visibilityValidator),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_variant", ["userId", "variantId"]),
});

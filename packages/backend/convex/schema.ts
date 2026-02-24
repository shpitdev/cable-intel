import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  CONFIDENCE_BAND_VALUES,
  CONNECTOR_VALUES,
  FOLLOW_UP_ANSWER_VALUES,
  FOLLOW_UP_CATEGORY_VALUES,
  MANUAL_INFERENCE_STATUS_VALUES,
  VIDEO_SUPPORT_VALUES,
} from "./manualInferenceLogic";

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

const catalogQualityStateValidator = v.union(
  v.literal("ready"),
  v.literal("needs_enrichment")
);

const enrichmentJobStatusValidator = v.union(
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

const connectorValidator = v.union(
  ...CONNECTOR_VALUES.map((connector) => v.literal(connector))
);

const videoSupportValidator = v.union(
  ...VIDEO_SUPPORT_VALUES.map((value) => v.literal(value))
);

const manualInferenceStatusValidator = v.union(
  ...MANUAL_INFERENCE_STATUS_VALUES.map((value) => v.literal(value))
);

const manualInferenceConfidenceBandValidator = v.union(
  ...CONFIDENCE_BAND_VALUES.map((value) => v.literal(value))
);

const followUpCategoryValidator = v.union(
  ...FOLLOW_UP_CATEGORY_VALUES.map((value) => v.literal(value))
);

const followUpAnswerValidator = v.union(
  ...FOLLOW_UP_ANSWER_VALUES.map((value) => v.literal(value))
);

const manualDraftValidator = v.object({
  connectorFrom: connectorValidator,
  connectorTo: connectorValidator,
  dataOnly: v.boolean(),
  gbps: v.string(),
  maxRefreshHz: v.string(),
  maxResolution: v.string(),
  usbGeneration: v.string(),
  videoSupport: videoSupportValidator,
  watts: v.string(),
});

const manualDraftPatchValidator = v.object({
  connectorFrom: v.optional(connectorValidator),
  connectorTo: v.optional(connectorValidator),
  dataOnly: v.optional(v.boolean()),
  gbps: v.optional(v.string()),
  maxRefreshHz: v.optional(v.string()),
  maxResolution: v.optional(v.string()),
  usbGeneration: v.optional(v.string()),
  videoSupport: v.optional(videoSupportValidator),
  watts: v.optional(v.string()),
});

const followUpQuestionValidator = v.object({
  id: v.string(),
  category: followUpCategoryValidator,
  prompt: v.string(),
  detail: v.optional(v.string()),
  status: v.union(v.literal("pending"), v.literal("answered")),
  answer: v.optional(followUpAnswerValidator),
  applyIfYes: manualDraftPatchValidator,
  applyIfNo: manualDraftPatchValidator,
  applyIfSkip: manualDraftPatchValidator,
});

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
    // Backward-compatible for existing records created before quality gating.
    qualityState: v.optional(catalogQualityStateValidator),
    qualityIssues: v.optional(v.array(v.string())),
    qualityUpdatedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_brand_model", ["brand", "model"])
    .index("by_brand_sku", ["brand", "sku"])
    .index("by_connector_pair", ["connectorFrom", "connectorTo"])
    .index("by_product_url", ["productUrl"])
    .index("by_quality_state", ["qualityState"]),

  catalogEnrichmentJobs: defineTable({
    variantId: v.id("cableVariants"),
    workflowRunId: v.optional(v.id("ingestionWorkflows")),
    status: enrichmentJobStatusValidator,
    reason: v.optional(v.string()),
    attemptCount: v.number(),
    lastError: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_variant", ["variantId"])
    .index("by_variant_status", ["variantId", "status"]),

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

  manualInferenceSessions: defineTable({
    workspaceId: v.string(),
    draft: manualDraftValidator,
    prompt: v.optional(v.string()),
    status: manualInferenceStatusValidator,
    confidence: v.number(),
    confidenceBand: manualInferenceConfidenceBandValidator,
    notes: v.optional(v.string()),
    followUpQuestions: v.array(followUpQuestionValidator),
    answeredQuestionCount: v.number(),
    llmUsed: v.boolean(),
    lastError: v.optional(v.string()),
    lastInferenceAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_status", ["status"])
    .index("by_updated_at", ["updatedAt"]),
});

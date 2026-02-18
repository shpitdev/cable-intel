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

const MODEL_LENGTH_TOKEN_REGEX =
  /\b\d+(?:\.\d+)?\s*(?:ft|feet|m|meter|meters)\b/i;

const canonicalizeUrlForGrouping = (value?: string): string => {
  if (!value) {
    return "";
  }
  try {
    const parsed = new URL(value);
    const pathname =
      parsed.pathname.endsWith("/") && parsed.pathname !== "/"
        ? parsed.pathname.slice(0, -1)
        : parsed.pathname;
    return `${parsed.hostname.toLowerCase()}${pathname.toLowerCase()}`;
  } catch {
    return normalizeToken(value);
  }
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

const scoreTopCableRow = (row: TopCableRow): number => {
  return scoreSpecCompleteness({
    power: row.power,
    data: row.data,
    video: row.video,
    evidenceRefs: row.evidenceRefs,
  });
};

const getLatestSourceFetchTime = (row: TopCableRow): number => {
  return row.sources.reduce((latest, source) => {
    return Math.max(latest, source.fetchedAt);
  }, 0);
};

const prefersLengthNeutralModel = (
  candidateModel: string,
  currentModel: string
): boolean | undefined => {
  const candidateHasLength = MODEL_LENGTH_TOKEN_REGEX.test(candidateModel);
  const currentHasLength = MODEL_LENGTH_TOKEN_REGEX.test(currentModel);
  if (candidateHasLength === currentHasLength) {
    return undefined;
  }
  return !candidateHasLength;
};

const isPreferredSkuRow = (
  candidate: TopCableRow,
  current: TopCableRow
): boolean => {
  const candidateScore = scoreTopCableRow(candidate);
  const currentScore = scoreTopCableRow(current);
  if (candidateScore !== currentScore) {
    return candidateScore > currentScore;
  }

  const prefersLengthNeutral = prefersLengthNeutralModel(
    candidate.model,
    current.model
  );
  if (typeof prefersLengthNeutral === "boolean") {
    return prefersLengthNeutral;
  }

  const candidateLatestSource = getLatestSourceFetchTime(candidate);
  const currentLatestSource = getLatestSourceFetchTime(current);
  if (candidateLatestSource !== currentLatestSource) {
    return candidateLatestSource > currentLatestSource;
  }

  return candidate.model.length > current.model.length;
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

const dedupeRowsByBrandSku = (rows: TopCableRow[]): TopCableRow[] => {
  const bestRowBySku = new Map<string, TopCableRow>();
  for (const row of rows) {
    const sku = normalizeToken(row.sku);
    if (!sku) {
      continue;
    }
    const key = `${normalizeToken(row.brand)}::${sku}`;
    const current = bestRowBySku.get(key);
    if (!current || isPreferredSkuRow(row, current)) {
      bestRowBySku.set(key, row);
    }
  }

  return rows.filter((row) => {
    const sku = normalizeToken(row.sku);
    if (!sku) {
      return true;
    }
    const key = `${normalizeToken(row.brand)}::${sku}`;
    return bestRowBySku.get(key) === row;
  });
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

interface WorkflowSpecCandidate {
  evidenceSources: WorkflowReport["cables"][number]["evidenceSources"];
  spec: Doc<"normalizedSpecs">;
  variant: Doc<"cableVariants">;
}

const buildWorkflowSpecIndex = async (
  ctx: QueryCtx,
  workflowRunId: Id<"ingestionWorkflows">
): Promise<{
  candidatesBySpecId: Map<Id<"normalizedSpecs">, WorkflowSpecCandidate>;
  specsByCanonicalUrl: Map<string, WorkflowSpecCandidate[]>;
}> => {
  const normalizedSpecs = await ctx.db
    .query("normalizedSpecs")
    .withIndex("by_workflow", (q) => q.eq("workflowRunId", workflowRunId))
    .collect();
  const sourceById = new Map<Id<"evidenceSources">, Doc<"evidenceSources">>();
  const variantsById = new Map<Id<"cableVariants">, Doc<"cableVariants">>();
  const candidatesBySpecId = new Map<
    Id<"normalizedSpecs">,
    WorkflowSpecCandidate
  >();
  const specsByCanonicalUrl = new Map<string, WorkflowSpecCandidate[]>();

  for (const spec of normalizedSpecs) {
    const existingVariant = variantsById.get(spec.variantId);
    const variant = existingVariant ?? (await ctx.db.get(spec.variantId));
    if (!variant) {
      continue;
    }
    variantsById.set(variant._id, variant);

    const evidenceSources: WorkflowReport["cables"][number]["evidenceSources"] =
      [];
    const groupingKeys = new Set<string>();
    groupingKeys.add(canonicalizeUrlForGrouping(variant.productUrl));

    for (const sourceId of spec.evidenceSourceIds) {
      const existingSource = sourceById.get(sourceId);
      const source = existingSource ?? (await ctx.db.get(sourceId));
      if (!source) {
        continue;
      }
      sourceById.set(source._id, source);
      evidenceSources.push({
        sourceId: source._id,
        url: source.url,
        canonicalUrl: source.canonicalUrl,
        fetchedAt: source.fetchedAt,
        contentHash: source.contentHash,
      });
      groupingKeys.add(canonicalizeUrlForGrouping(source.canonicalUrl));
      groupingKeys.add(canonicalizeUrlForGrouping(source.url));
    }

    const candidate = {
      spec,
      variant,
      evidenceSources,
    };
    candidatesBySpecId.set(spec._id, candidate);
    for (const groupingKey of groupingKeys) {
      if (!groupingKey) {
        continue;
      }
      const existing = specsByCanonicalUrl.get(groupingKey);
      if (existing) {
        existing.push(candidate);
      } else {
        specsByCanonicalUrl.set(groupingKey, [candidate]);
      }
    }
  }

  return {
    candidatesBySpecId,
    specsByCanonicalUrl,
  };
};

const collectCandidatesForWorkflowItem = (
  item: Doc<"ingestionWorkflowItems">,
  specsByCanonicalUrl: Map<string, WorkflowSpecCandidate[]>,
  candidatesBySpecId: Map<Id<"normalizedSpecs">, WorkflowSpecCandidate>
): WorkflowSpecCandidate[] => {
  const itemKeys = new Set(
    [
      canonicalizeUrlForGrouping(item.canonicalUrl),
      canonicalizeUrlForGrouping(item.url),
    ].filter(Boolean)
  );

  const getLatestEvidenceFetchedAt = (
    candidate: WorkflowSpecCandidate
  ): number => {
    return candidate.evidenceSources.reduce((latest, source) => {
      return Math.max(latest, source.fetchedAt);
    }, 0);
  };

  const candidateMatchesItem = (candidate: WorkflowSpecCandidate): boolean => {
    const variantKey = canonicalizeUrlForGrouping(candidate.variant.productUrl);
    if (variantKey && itemKeys.has(variantKey)) {
      return true;
    }

    for (const source of candidate.evidenceSources) {
      const canonicalKey = canonicalizeUrlForGrouping(source.canonicalUrl);
      if (canonicalKey && itemKeys.has(canonicalKey)) {
        return true;
      }
      const urlKey = canonicalizeUrlForGrouping(source.url);
      if (urlKey && itemKeys.has(urlKey)) {
        return true;
      }
    }

    return false;
  };

  const isPreferredCandidate = (
    candidate: WorkflowSpecCandidate,
    current: WorkflowSpecCandidate
  ): boolean => {
    const candidateMatches = candidateMatchesItem(candidate);
    const currentMatches = candidateMatchesItem(current);
    if (candidateMatches !== currentMatches) {
      return candidateMatches;
    }

    const candidateScore = scoreSpecCompleteness(candidate.spec);
    const currentScore = scoreSpecCompleteness(current.spec);
    if (candidateScore !== currentScore) {
      return candidateScore > currentScore;
    }

    const candidateFetchedAt = getLatestEvidenceFetchedAt(candidate);
    const currentFetchedAt = getLatestEvidenceFetchedAt(current);
    if (candidateFetchedAt !== currentFetchedAt) {
      return candidateFetchedAt > currentFetchedAt;
    }

    return candidate.spec._creationTime > current.spec._creationTime;
  };

  const itemKeyList = [
    canonicalizeUrlForGrouping(item.canonicalUrl),
    canonicalizeUrlForGrouping(item.url),
  ].filter(Boolean);
  const candidatesByVariant = new Map<
    Id<"cableVariants">,
    WorkflowSpecCandidate
  >();
  for (const itemKey of itemKeyList) {
    const matches = specsByCanonicalUrl.get(itemKey) ?? [];
    for (const match of matches) {
      const current = candidatesByVariant.get(match.variant._id);
      if (!current || isPreferredCandidate(match, current)) {
        candidatesByVariant.set(match.variant._id, match);
      }
    }
  }

  if (candidatesByVariant.size === 0 && item.normalizedSpecId) {
    const fallback = candidatesBySpecId.get(item.normalizedSpecId);
    if (fallback) {
      candidatesByVariant.set(fallback.variant._id, fallback);
    }
  }

  return [...candidatesByVariant.values()].sort((left, right) => {
    const leftVariantKey =
      normalizeToken(left.variant.variant) ||
      normalizeToken(left.variant.sku) ||
      normalizeToken(left.variant.model);
    const rightVariantKey =
      normalizeToken(right.variant.variant) ||
      normalizeToken(right.variant.sku) ||
      normalizeToken(right.variant.model);
    return leftVariantKey.localeCompare(rightVariantKey);
  });
};

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

  const { specsByCanonicalUrl, candidatesBySpecId } =
    await buildWorkflowSpecIndex(ctx, workflowRunId);

  const cableRows: WorkflowReport["cables"] = [];
  for (const item of completedItems.slice(0, limit)) {
    const matches = collectCandidatesForWorkflowItem(
      item,
      specsByCanonicalUrl,
      candidatesBySpecId
    );
    for (const match of matches) {
      cableRows.push({
        workflowItemId: item._id,
        sourceUrl: item.url,
        canonicalUrl: item.canonicalUrl,
        brand: match.variant.brand,
        model: match.variant.model,
        variant: match.variant.variant,
        sku: match.variant.sku,
        connectorFrom: match.variant.connectorFrom,
        connectorTo: match.variant.connectorTo,
        productUrl: match.variant.productUrl,
        imageUrls: match.variant.imageUrls,
        power: match.spec.power,
        data: match.spec.data,
        video: match.spec.video,
        evidenceRefs: match.spec.evidenceRefs,
        evidenceSources: match.evidenceSources,
      });
    }
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
    const dedupedRows = dedupeRowsByBrandSku(cleanedRows);
    return dedupedRows.slice(0, limit);
  },
});

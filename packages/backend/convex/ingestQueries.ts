import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { type QueryCtx, query } from "./_generated/server";

const catalogQualityStateValidator = v.union(
  v.literal("ready"),
  v.literal("needs_enrichment")
);

type CatalogQualityState = "ready" | "needs_enrichment";

const LEGACY_QUALITY_STATE: CatalogQualityState = "needs_enrichment";
const LEGACY_QUALITY_ISSUES = ["legacy_missing_quality_fields"] as const;

const normalizeQualityState = (
  value?: CatalogQualityState
): CatalogQualityState => {
  return value ?? LEGACY_QUALITY_STATE;
};

const normalizeQualityIssues = (value?: string[]): string[] => {
  if (value) {
    return value;
  }
  return [...LEGACY_QUALITY_ISSUES];
};

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
  qualityIssues: string[];
  qualityState: CatalogQualityState;
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
      qualityState: normalizeQualityState(variant.qualityState),
      qualityIssues: normalizeQualityIssues(variant.qualityIssues),
    });
  }

  return rows;
};

const normalizeToken = (value?: string): string => {
  return value?.trim().toLowerCase() ?? "";
};

const REGION_SUFFIX_REGEX = /-(us|uk|eu|ca|au|jp)$/;

const normalizeBrandToken = (brand?: string): string => {
  const token = normalizeToken(brand);
  if (!token) {
    return "";
  }

  const withoutBetaPrefix = token.startsWith("beta-")
    ? token.slice("beta-".length)
    : token;
  return withoutBetaPrefix.replace(REGION_SUFFIX_REGEX, "");
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
  if (candidate.qualityState !== current.qualityState) {
    return candidate.qualityState === "ready";
  }

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
        normalizeBrandToken(row.brand),
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
    const key = `${normalizeBrandToken(row.brand)}::${sku}`;
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
    const key = `${normalizeBrandToken(row.brand)}::${sku}`;
    return bestRowBySku.get(key) === row;
  });
};

const SEARCH_TOKEN_REGEX = /[a-z0-9]+/g;
const SEARCH_NORMALIZE_REGEX = /[^a-z0-9]+/g;
const USB_C_WORD_REGEX = /\busb c\b/;
const TYPE_C_WORD_REGEX = /\btype c\b/;
const USB_A_WORD_REGEX = /\busb a\b/;
const MICRO_USB_WORD_REGEX = /\bmicro usb\b/;
const THUNDERBOLT_WORD_REGEX = /\bthunderbolt\b/;
const TB_WORD_REGEX = /\btb\b/;
const CONNECTOR_PAIR_REGEX =
  /\b(usbc|usb[\s-]*c|type[\s-]*c|usba|usb[\s-]*a|lightning|micro[\s-]*usb|microusb|c|a|m)\b\s*(?:to|->|\/)\s*\b(usbc|usb[\s-]*c|type[\s-]*c|usba|usb[\s-]*a|lightning|micro[\s-]*usb|microusb|c|a|m)\b/i;
const CONNECTOR_MENTION_PATTERNS = [
  {
    connector: "usbc",
    regex: /\busbc\b|\busb[\s-]*c\b|\btype[\s-]*c\b/i,
  },
  {
    connector: "usba",
    regex: /\busba\b|\busb[\s-]*a\b/i,
  },
  {
    connector: "lightning",
    regex: /\blightning\b/i,
  },
  {
    connector: "microusb",
    regex: /\bmicrousb\b|\bmicro[\s-]*usb\b/i,
  },
] as const;
const WATTS_REGEX = /\b(\d{2,3})\s*w\b|\b(\d{2,3})w\b/gi;

type ConnectorKey = "lightning" | "microusb" | "usba" | "usbc";

interface ParsedCatalogSearchQuery {
  brandHint?: string;
  connectorHints: ConnectorKey[];
  connectorPair?: {
    from: ConnectorKey;
    to: ConnectorKey;
  };
  normalized: string;
  requestedWatts?: number;
  tokens: string[];
}

interface RowSearchIndex {
  brandToken: string;
  connectorFrom: ConnectorKey | undefined;
  connectorTo: ConnectorKey | undefined;
  searchableText: string;
  tokenSet: Set<string>;
  tokens: string[];
}

const normalizeSearchText = (value: string): string => {
  return value
    .toLowerCase()
    .replace(SEARCH_NORMALIZE_REGEX, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
};

const toConnectorKey = (value?: string): ConnectorKey | undefined => {
  const normalized = value
    ?.toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "")
    .trim();
  if (!normalized) {
    return undefined;
  }
  if (normalized === "usbc" || normalized === "typec" || normalized === "c") {
    return "usbc";
  }
  if (normalized === "usba" || normalized === "a") {
    return "usba";
  }
  if (normalized === "lightning") {
    return "lightning";
  }
  if (
    normalized === "microusb" ||
    normalized === "micro" ||
    normalized === "m"
  ) {
    return "microusb";
  }
  return undefined;
};

const extractSearchTokens = (value: string): string[] => {
  const normalized = normalizeSearchText(value);
  const baseTokens = normalized.match(SEARCH_TOKEN_REGEX) ?? [];
  const tokens = new Set(baseTokens.filter((token) => token.length >= 2));

  if (USB_C_WORD_REGEX.test(normalized) || TYPE_C_WORD_REGEX.test(normalized)) {
    tokens.add("usbc");
  }
  if (USB_A_WORD_REGEX.test(normalized)) {
    tokens.add("usba");
  }
  if (MICRO_USB_WORD_REGEX.test(normalized)) {
    tokens.add("microusb");
  }
  if (
    THUNDERBOLT_WORD_REGEX.test(normalized) ||
    TB_WORD_REGEX.test(normalized)
  ) {
    tokens.add("thunderbolt");
    tokens.add("tb");
  }

  return [...tokens];
};

const isSingleTransposition = (left: string, right: string): boolean => {
  if (left.length !== right.length) {
    return false;
  }

  const mismatches: number[] = [];
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      mismatches.push(index);
      if (mismatches.length > 2) {
        return false;
      }
    }
  }

  if (mismatches.length !== 2) {
    return false;
  }
  const [first, second] = mismatches;
  if (first === undefined || second === undefined) {
    return false;
  }
  return left[first] === right[second] && left[second] === right[first];
};

const isEditDistanceAtMostOne = (left: string, right: string): boolean => {
  if (Math.abs(left.length - right.length) > 1) {
    return false;
  }

  let leftIndex = 0;
  let rightIndex = 0;
  let edits = 0;

  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }

    edits += 1;
    if (edits > 1) {
      return false;
    }

    if (left.length > right.length) {
      leftIndex += 1;
      continue;
    }
    if (right.length > left.length) {
      rightIndex += 1;
      continue;
    }

    leftIndex += 1;
    rightIndex += 1;
  }

  if (leftIndex < left.length || rightIndex < right.length) {
    edits += 1;
  }

  return edits <= 1;
};

const isNearSearchTokenMatch = (left: string, right: string): boolean => {
  if (left === right) {
    return true;
  }

  if (left.length < 3 || right.length < 3) {
    return false;
  }

  if (left.startsWith(right) || right.startsWith(left)) {
    return true;
  }

  if (isSingleTransposition(left, right)) {
    return true;
  }

  return isEditDistanceAtMostOne(left, right);
};

const extractConnectorPair = (
  rawQuery: string
):
  | {
      from: ConnectorKey;
      to: ConnectorKey;
    }
  | undefined => {
  const pairMatch = rawQuery.match(CONNECTOR_PAIR_REGEX);
  if (!pairMatch) {
    return undefined;
  }
  const [, rawFrom, rawTo] = pairMatch;
  const from = toConnectorKey(rawFrom);
  const to = toConnectorKey(rawTo);
  if (!(from && to)) {
    return undefined;
  }

  return {
    from,
    to,
  };
};

const extractConnectorHints = (rawQuery: string): ConnectorKey[] => {
  const hints = new Set<ConnectorKey>();
  for (const pattern of CONNECTOR_MENTION_PATTERNS) {
    if (pattern.regex.test(rawQuery)) {
      hints.add(pattern.connector);
    }
  }
  return [...hints];
};

const extractRequestedWatts = (rawQuery: string): number | undefined => {
  const matches = rawQuery.matchAll(WATTS_REGEX);
  const values: number[] = [];
  for (const match of matches) {
    const rawValue = match[1] ?? match[2];
    if (!rawValue) {
      continue;
    }
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
      continue;
    }
    values.push(parsed);
  }

  if (values.length === 0) {
    return undefined;
  }
  return Math.max(...values);
};

const detectBrandHint = (
  queryTokens: string[],
  rows: TopCableRow[]
): string | undefined => {
  const knownBrands = new Set<string>();
  for (const row of rows) {
    const normalizedBrand = normalizeBrandToken(row.brand);
    if (!normalizedBrand) {
      continue;
    }
    knownBrands.add(normalizedBrand);
  }

  let bestMatch:
    | {
        brand: string;
        score: number;
      }
    | undefined;

  for (const token of queryTokens) {
    for (const brand of knownBrands) {
      let score = 0;
      if (token === brand) {
        score = 3;
      } else if (isNearSearchTokenMatch(token, brand)) {
        score = 2;
      }

      if (score === 0) {
        continue;
      }

      if (
        !bestMatch ||
        score > bestMatch.score ||
        (score === bestMatch.score && brand.length > bestMatch.brand.length)
      ) {
        bestMatch = {
          brand,
          score,
        };
      }
    }
  }

  return bestMatch?.brand;
};

const parseCatalogSearchQuery = (
  query: string,
  rows: TopCableRow[]
): ParsedCatalogSearchQuery => {
  const normalized = normalizeSearchText(query);
  const tokens = extractSearchTokens(query);
  const rawLower = query.toLowerCase();
  const connectorPair = extractConnectorPair(rawLower);
  const connectorHints = extractConnectorHints(rawLower);

  if (connectorPair) {
    connectorHints.push(connectorPair.from, connectorPair.to);
  }

  const uniqueConnectorHints = [...new Set(connectorHints)];

  return {
    normalized,
    tokens,
    connectorPair,
    connectorHints: uniqueConnectorHints,
    requestedWatts: extractRequestedWatts(rawLower),
    brandHint: detectBrandHint(tokens, rows),
  };
};

const buildRowSearchIndex = (row: TopCableRow): RowSearchIndex => {
  const fields = [
    row.brand,
    row.model,
    row.variant,
    row.sku,
    row.productUrl,
    row.connectorFrom,
    row.connectorTo,
    row.power.maxWatts ? `${row.power.maxWatts}w` : undefined,
    row.data.usbGeneration,
    row.data.maxGbps ? `${row.data.maxGbps}gbps` : undefined,
  ]
    .filter(Boolean)
    .join(" ");
  const tokens = extractSearchTokens(fields);

  return {
    brandToken: normalizeBrandToken(row.brand),
    connectorFrom: toConnectorKey(row.connectorFrom),
    connectorTo: toConnectorKey(row.connectorTo),
    searchableText: normalizeSearchText(fields),
    tokens,
    tokenSet: new Set(tokens),
  };
};

const scoreBrandMatch = (
  index: RowSearchIndex,
  parsedQuery: ParsedCatalogSearchQuery
): number => {
  const brandHint = parsedQuery.brandHint;
  if (!brandHint) {
    return 0;
  }

  if (index.brandToken === brandHint) {
    return 95;
  }

  if (isNearSearchTokenMatch(index.brandToken, brandHint)) {
    return 70;
  }

  return -8;
};

const scoreConnectorMatch = (
  index: RowSearchIndex,
  parsedQuery: ParsedCatalogSearchQuery
): number => {
  const rowFrom = index.connectorFrom;
  const rowTo = index.connectorTo;
  if (!(rowFrom && rowTo)) {
    return 0;
  }

  const pair = parsedQuery.connectorPair;
  if (pair) {
    if (rowFrom === pair.from && rowTo === pair.to) {
      return 140;
    }
    if (rowFrom === pair.to && rowTo === pair.from) {
      return 120;
    }

    const rowSet = new Set([rowFrom, rowTo]);
    const matchedCount = [pair.from, pair.to].filter((connector) =>
      rowSet.has(connector)
    ).length;
    return matchedCount * 24;
  }

  if (parsedQuery.connectorHints.length === 0) {
    return 0;
  }

  const rowSet = new Set([rowFrom, rowTo]);
  const matchedCount = parsedQuery.connectorHints.filter((connector) =>
    rowSet.has(connector)
  ).length;
  return matchedCount * 24;
};

const scorePowerMatch = (
  row: TopCableRow,
  parsedQuery: ParsedCatalogSearchQuery
): number => {
  const requestedWatts = parsedQuery.requestedWatts;
  if (!requestedWatts) {
    return 0;
  }

  const maxWatts = row.power.maxWatts;
  if (typeof maxWatts !== "number") {
    return -6;
  }

  const delta = Math.abs(maxWatts - requestedWatts);
  if (delta === 0) {
    return 90;
  }

  if (maxWatts >= requestedWatts) {
    return Math.max(20, 70 - delta);
  }

  return Math.max(0, 40 - delta);
};

const scoreLexicalMatch = (
  index: RowSearchIndex,
  parsedQuery: ParsedCatalogSearchQuery
): number => {
  let score = 0;
  for (const token of parsedQuery.tokens) {
    if (index.tokenSet.has(token)) {
      score += token.length >= 4 ? 10 : 7;
      continue;
    }

    const hasPrefixMatch = index.tokens.some((rowToken) => {
      return (
        rowToken.startsWith(token) ||
        (token.length >= 3 && token.startsWith(rowToken))
      );
    });
    if (hasPrefixMatch) {
      score += 4;
      continue;
    }

    if (token.length < 4) {
      continue;
    }

    const hasNearMatch = index.tokens.some((rowToken) => {
      return isNearSearchTokenMatch(token, rowToken);
    });
    if (hasNearMatch) {
      score += 4;
    }
  }

  if (
    parsedQuery.normalized &&
    index.searchableText.includes(parsedQuery.normalized)
  ) {
    score += 20;
  }

  return score;
};

const scoreRowForSearch = (
  row: TopCableRow,
  index: RowSearchIndex,
  parsedQuery: ParsedCatalogSearchQuery
): number => {
  const qualityScore = row.qualityState === "ready" ? 12 : 0;
  const completenessScore = scoreTopCableRow(row);

  return (
    scoreBrandMatch(index, parsedQuery) +
    scoreConnectorMatch(index, parsedQuery) +
    scorePowerMatch(row, parsedQuery) +
    scoreLexicalMatch(index, parsedQuery) +
    qualityScore +
    completenessScore
  );
};

const rankRowsForSearch = (
  rows: TopCableRow[],
  searchQuery?: string
): TopCableRow[] => {
  const trimmedQuery = searchQuery?.trim();
  if (!trimmedQuery) {
    return rows;
  }

  const parsedQuery = parseCatalogSearchQuery(trimmedQuery, rows);
  const scored = rows.map((row, index) => {
    const rowSearchIndex = buildRowSearchIndex(row);
    return {
      row,
      index,
      score: scoreRowForSearch(row, rowSearchIndex, parsedQuery),
    };
  });

  scored.sort((left, right) => {
    if (left.score !== right.score) {
      return right.score - left.score;
    }

    if (left.row.qualityState !== right.row.qualityState) {
      return left.row.qualityState === "ready" ? -1 : 1;
    }

    const leftCompleteness = scoreTopCableRow(left.row);
    const rightCompleteness = scoreTopCableRow(right.row);
    if (leftCompleteness !== rightCompleteness) {
      return rightCompleteness - leftCompleteness;
    }

    const leftLatest = getLatestSourceFetchTime(left.row);
    const rightLatest = getLatestSourceFetchTime(right.row);
    if (leftLatest !== rightLatest) {
      return rightLatest - leftLatest;
    }

    return left.index - right.index;
  });

  return scored.map((entry) => entry.row);
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
    qualityState: CatalogQualityState;
    qualityIssues: string[];
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
        qualityState: normalizeQualityState(match.variant.qualityState),
        qualityIssues: normalizeQualityIssues(match.variant.qualityIssues),
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
    includeStates: v.optional(v.array(catalogQualityStateValidator)),
    searchQuery: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(args.limit ?? 10, 0);
    const scanLimit = Math.max(limit * 40, limit);
    const includeStates = new Set(args.includeStates ?? ["ready"]);
    const specs = await ctx.db
      .query("normalizedSpecs")
      .order("desc")
      .take(scanLimit);
    const rankedSpecs = pickBestSpecsByVariant(specs, scanLimit);
    const hydratedRows = await hydrateTopCableRows(ctx, rankedSpecs);
    const cleanedRows = pruneLegacyCatalogRows(hydratedRows);
    const dedupedRows = dedupeRowsByBrandSku(cleanedRows);
    const stateFilteredRows = dedupedRows.filter((row) => {
      return includeStates.has(row.qualityState);
    });
    const searchRankedRows = rankRowsForSearch(
      stateFilteredRows,
      args.searchQuery
    );
    return searchRankedRows.slice(0, limit);
  },
});

export const getTopCablesForReview = query({
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

export const getEnrichmentQueueSummary = query({
  args: {},
  handler: async (ctx) => {
    const pending = await ctx.db
      .query("catalogEnrichmentJobs")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
    const inProgress = await ctx.db
      .query("catalogEnrichmentJobs")
      .withIndex("by_status", (q) => q.eq("status", "in_progress"))
      .collect();
    const failed = await ctx.db
      .query("catalogEnrichmentJobs")
      .withIndex("by_status", (q) => q.eq("status", "failed"))
      .collect();

    return {
      pending: pending.length,
      inProgress: inProgress.length,
      failed: failed.length,
    };
  },
});

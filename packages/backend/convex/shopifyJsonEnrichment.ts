import { z } from "zod";
import type { ExtractionOutput } from "./contracts/extraction";

const POWER_REGEX = /(\d{1,3}(?:\.\d+)?)\s*W\b/gi;
const PD_REGEX = /\bPD\b|Power Delivery/i;
const EPR_REGEX = /\bEPR\b/i;
const MAX_WATTAGE = 500;

const UNKNOWN_CONNECTOR_TOKENS = new Set(["", "unknown", "n/a", "na"]);

const cleanText = (value: unknown): string => {
  if (typeof value !== "string") {
    return "";
  }
  return value
    .replaceAll(/<[^>]+>/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
};

const shopifyOptionSchema = z.object({
  name: z.unknown().optional(),
  values: z.array(z.unknown()).optional(),
});

const shopifyVariantSchema = z.object({
  available: z.boolean().optional(),
  barcode: z.unknown().optional(),
  option1: z.unknown().nullable().optional(),
  option2: z.unknown().nullable().optional(),
  option3: z.unknown().nullable().optional(),
  price: z.number().optional(),
  public_title: z.unknown().nullable().optional(),
  sku: z.unknown().nullable().optional(),
  title: z.unknown().nullable().optional(),
});

const shopifyProductJsonSchema = z
  .object({
    description: z.unknown().optional(),
    handle: z.unknown().optional(),
    options: z.array(z.union([z.string(), shopifyOptionSchema])).optional(),
    tags: z.array(z.unknown()).optional(),
    title: z.unknown().optional(),
    type: z.unknown().optional(),
    variants: z.array(shopifyVariantSchema).optional(),
    vendor: z.unknown().optional(),
  })
  .passthrough();

const llmEvidenceFieldPathSchema = z.enum([
  "connectorPair.from",
  "connectorPair.to",
  "power.maxWatts",
  "power.pdSupported",
  "power.eprSupported",
  "data.usbGeneration",
  "data.maxGbps",
  "video.explicitlySupported",
  "video.maxResolution",
  "video.maxRefreshHz",
]);

const llmEvidenceEntrySchema = z.object({
  fieldPath: llmEvidenceFieldPathSchema,
  snippet: z.string().min(1),
});

export const shopifyJsonLlmEnrichmentSchema = z
  .object({
    connectorPair: z
      .object({
        from: z.string().min(1).optional(),
        to: z.string().min(1).optional(),
      })
      .optional(),
    data: z
      .object({
        maxGbps: z.number().positive().optional(),
        usbGeneration: z.string().min(1).optional(),
      })
      .optional(),
    evidence: z.array(llmEvidenceEntrySchema).default([]),
    power: z
      .object({
        eprSupported: z.boolean().optional(),
        maxWatts: z.number().positive().max(MAX_WATTAGE).optional(),
        pdSupported: z.boolean().optional(),
      })
      .optional(),
    video: z
      .object({
        explicitlySupported: z.boolean().optional(),
        maxRefreshHz: z.number().positive().optional(),
        maxResolution: z.string().min(1).optional(),
      })
      .optional(),
  })
  .strict();

export type ShopifyJsonLlmEnrichment = z.infer<
  typeof shopifyJsonLlmEnrichmentSchema
>;

export interface ShopifyJsonVariantInput {
  available: boolean | null;
  barcode?: string;
  optionValues: string[];
  priceCents: number | null;
  publicTitle?: string;
  sku?: string;
  title?: string;
}

export interface ShopifyJsonEnrichmentInput {
  description: string;
  handle: string;
  options: Array<{
    name: string;
    values: string[];
  }>;
  tags: string[];
  target: {
    sku?: string;
    variant?: string;
  };
  title: string;
  type: string;
  variants: ShopifyJsonVariantInput[];
  vendor: string;
}

export interface DeterministicPowerSignals {
  eprSupported?: boolean;
  maxWatts?: number;
  pdSupported?: boolean;
  snippet?: string;
}

const normalizeConnector = (value: string): string => {
  return value.trim().toLowerCase();
};

const isUnknownConnector = (value: string): boolean => {
  return UNKNOWN_CONNECTOR_TOKENS.has(normalizeConnector(value));
};

const isUsbCToUsbC = (from: string, to: string): boolean => {
  return (
    normalizeConnector(from) === "usb-c" && normalizeConnector(to) === "usb-c"
  );
};

const safeSnippet = (value: string): string => {
  return cleanText(value).slice(0, 240);
};

const toOptionValue = (value: unknown): string => {
  if (typeof value === "string") {
    return cleanText(value);
  }
  if (value && typeof value === "object") {
    const candidate = value as { label?: unknown; value?: unknown };
    const label = cleanText(candidate.label);
    if (label) {
      return label;
    }
    return cleanText(candidate.value);
  }
  return "";
};

const toVariantInput = (
  variant: z.infer<typeof shopifyVariantSchema>
): ShopifyJsonVariantInput => {
  const optionValues = [variant.option1, variant.option2, variant.option3]
    .map((value) => cleanText(value))
    .filter(Boolean);

  return {
    available:
      typeof variant.available === "boolean" ? variant.available : null,
    barcode: cleanText(variant.barcode) || undefined,
    optionValues,
    priceCents: Number.isFinite(variant.price) ? (variant.price ?? null) : null,
    publicTitle: cleanText(variant.public_title) || undefined,
    sku: cleanText(variant.sku) || undefined,
    title: cleanText(variant.title) || undefined,
  };
};

const dedupeStrings = (values: readonly string[]): string[] => {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const value of values) {
    const cleaned = cleanText(value);
    if (!cleaned) {
      continue;
    }
    const key = cleaned.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(cleaned);
  }
  return deduped;
};

const toOptionInput = (
  option: string | z.infer<typeof shopifyOptionSchema>
): { name: string; values: string[] } | null => {
  if (typeof option === "string") {
    return {
      name: cleanText(option),
      values: [],
    };
  }

  const name = cleanText(option.name);
  const values = dedupeStrings((option.values ?? []).map(toOptionValue));

  if (!(name || values.length > 0)) {
    return null;
  }

  return {
    name,
    values,
  };
};

export const buildShopifyJsonEnrichmentInput = (
  payload: unknown,
  target: {
    sku?: string;
    variant?: string;
  }
): ShopifyJsonEnrichmentInput | null => {
  const parsed = shopifyProductJsonSchema.safeParse(payload);
  if (!parsed.success) {
    return null;
  }

  const product = parsed.data;
  const variants = (product.variants ?? []).map(toVariantInput);
  const options = (product.options ?? [])
    .map(toOptionInput)
    .filter((option): option is { name: string; values: string[] } => {
      return option !== null;
    });

  return {
    description: cleanText(product.description),
    handle: cleanText(product.handle),
    options,
    tags: dedupeStrings(product.tags?.map((tag) => cleanText(tag)) ?? []),
    target: {
      sku: cleanText(target.sku) || undefined,
      variant: cleanText(target.variant) || undefined,
    },
    title: cleanText(product.title),
    type: cleanText(product.type),
    variants,
    vendor: cleanText(product.vendor),
  };
};

const collectPowerSignalSegments = (
  input: ShopifyJsonEnrichmentInput
): string[] => {
  const optionLines = input.options.flatMap((option) => {
    const values = option.values.join(" / ");
    if (!(option.name || values)) {
      return [];
    }
    return [`${option.name}: ${values}`];
  });

  const variantLines = input.variants.map((variant) => {
    const title = [variant.title, variant.publicTitle]
      .filter(Boolean)
      .join(" / ");
    const optionValues = variant.optionValues.join(" / ");
    const sku = variant.sku ? `SKU ${variant.sku}` : "";
    const barcode = variant.barcode ? `Barcode ${variant.barcode}` : "";
    return [title, optionValues, sku, barcode].filter(Boolean).join(" | ");
  });

  return [
    input.title,
    input.description,
    input.tags.join(" | "),
    ...optionLines,
    ...variantLines,
  ]
    .map(cleanText)
    .filter(Boolean);
};

const getMaxWattsFromSegments = (
  segments: readonly string[]
): {
  maxWatts?: number;
  snippet?: string;
} => {
  let maxWatts: number | undefined;
  let snippet: string | undefined;

  for (const segment of segments) {
    const matches = [...segment.matchAll(POWER_REGEX)];
    for (const match of matches) {
      const raw = Number(match[1]);
      if (!(Number.isFinite(raw) && raw > 0 && raw <= MAX_WATTAGE)) {
        continue;
      }
      if (maxWatts === undefined || raw > maxWatts) {
        maxWatts = raw;
        snippet = safeSnippet(segment);
      }
    }
  }

  return {
    maxWatts,
    snippet,
  };
};

export const deriveDeterministicPowerSignals = (
  input: ShopifyJsonEnrichmentInput
): DeterministicPowerSignals => {
  const segments = collectPowerSignalSegments(input);
  const { maxWatts, snippet } = getMaxWattsFromSegments(segments);
  const combined = segments.join("\n");

  return {
    eprSupported: EPR_REGEX.test(combined) ? true : undefined,
    maxWatts,
    pdSupported: PD_REGEX.test(combined) ? true : undefined,
    snippet,
  };
};

const addEvidenceIfMissing = (
  evidence: ExtractionOutput["evidence"],
  fieldPath: string,
  sourceUrl: string,
  snippet?: string
): void => {
  const hasFieldPath = evidence.some((item) => item.fieldPath === fieldPath);
  if (hasFieldPath) {
    return;
  }

  evidence.push({
    fieldPath,
    snippet: snippet ? safeSnippet(snippet) : undefined,
    sourceUrl,
  });
};

const hasExplicitWattsToken = (value: number, haystack: string): boolean => {
  const pattern = new RegExp(`\\b${value}(?:\\.0+)?\\s*W\\b`, "i");
  return pattern.test(haystack);
};

const llmSnippetForField = (
  enrichment: ShopifyJsonLlmEnrichment,
  fieldPath: z.infer<typeof llmEvidenceFieldPathSchema>
): string | undefined => {
  return enrichment.evidence.find((item) => item.fieldPath === fieldPath)
    ?.snippet;
};

export const applyShopifyJsonPowerSignals = (
  parsed: ExtractionOutput,
  sourceUrl: string,
  signals: DeterministicPowerSignals
): ExtractionOutput => {
  const next: ExtractionOutput = {
    ...parsed,
    evidence: [...parsed.evidence],
    power: {
      ...parsed.power,
    },
  };

  if (
    typeof signals.maxWatts === "number" &&
    !(typeof next.power.maxWatts === "number" && next.power.maxWatts > 0)
  ) {
    next.power.maxWatts = signals.maxWatts;
    addEvidenceIfMissing(
      next.evidence,
      "power.maxWatts",
      sourceUrl,
      signals.snippet ?? `${signals.maxWatts}W`
    );
  }

  if (signals.pdSupported === true && next.power.pdSupported !== true) {
    next.power.pdSupported = true;
    addEvidenceIfMissing(next.evidence, "power.pdSupported", sourceUrl, "PD");
  }

  if (signals.eprSupported === true && next.power.eprSupported !== true) {
    next.power.eprSupported = true;
    addEvidenceIfMissing(next.evidence, "power.eprSupported", sourceUrl, "EPR");
  }

  return next;
};

export const applyShopifyJsonLlmEnrichment = (
  parsed: ExtractionOutput,
  sourceUrl: string,
  enrichment: ShopifyJsonLlmEnrichment,
  inputTextForValidation: string
): ExtractionOutput => {
  const next: ExtractionOutput = {
    ...parsed,
    data: {
      ...parsed.data,
    },
    evidence: [...parsed.evidence],
    power: {
      ...parsed.power,
    },
    video: {
      ...parsed.video,
    },
  };

  applyLlmConnectorSignals(next, sourceUrl, enrichment);
  applyLlmPowerSignals(next, sourceUrl, enrichment, inputTextForValidation);
  applyLlmDataSignals(next, sourceUrl, enrichment);
  applyLlmVideoSignals(next, sourceUrl, enrichment);

  return next;
};

const applyLlmConnectorSignals = (
  target: ExtractionOutput,
  sourceUrl: string,
  enrichment: ShopifyJsonLlmEnrichment
): void => {
  const connectorFrom = cleanText(enrichment.connectorPair?.from);
  if (connectorFrom && isUnknownConnector(target.connectorPair.from)) {
    target.connectorPair.from = connectorFrom;
    addEvidenceIfMissing(
      target.evidence,
      "connectorPair.from",
      sourceUrl,
      llmSnippetForField(enrichment, "connectorPair.from")
    );
  }

  const connectorTo = cleanText(enrichment.connectorPair?.to);
  if (connectorTo && isUnknownConnector(target.connectorPair.to)) {
    target.connectorPair.to = connectorTo;
    addEvidenceIfMissing(
      target.evidence,
      "connectorPair.to",
      sourceUrl,
      llmSnippetForField(enrichment, "connectorPair.to")
    );
  }
};

const applyLlmPowerSignals = (
  target: ExtractionOutput,
  sourceUrl: string,
  enrichment: ShopifyJsonLlmEnrichment,
  inputTextForValidation: string
): void => {
  const llmWatts = enrichment.power?.maxWatts;
  if (
    typeof llmWatts === "number" &&
    !(typeof target.power.maxWatts === "number" && target.power.maxWatts > 0) &&
    hasExplicitWattsToken(llmWatts, inputTextForValidation)
  ) {
    target.power.maxWatts = llmWatts;
    addEvidenceIfMissing(
      target.evidence,
      "power.maxWatts",
      sourceUrl,
      llmSnippetForField(enrichment, "power.maxWatts") ?? `${llmWatts}W`
    );
  }

  if (
    enrichment.power?.pdSupported === true &&
    target.power.pdSupported !== true
  ) {
    target.power.pdSupported = true;
    addEvidenceIfMissing(
      target.evidence,
      "power.pdSupported",
      sourceUrl,
      llmSnippetForField(enrichment, "power.pdSupported")
    );
  }

  if (
    enrichment.power?.eprSupported === true &&
    target.power.eprSupported !== true
  ) {
    target.power.eprSupported = true;
    addEvidenceIfMissing(
      target.evidence,
      "power.eprSupported",
      sourceUrl,
      llmSnippetForField(enrichment, "power.eprSupported")
    );
  }
};

const applyLlmDataSignals = (
  target: ExtractionOutput,
  sourceUrl: string,
  enrichment: ShopifyJsonLlmEnrichment
): void => {
  if (
    typeof enrichment.data?.maxGbps === "number" &&
    typeof target.data.maxGbps !== "number"
  ) {
    target.data.maxGbps = enrichment.data.maxGbps;
    addEvidenceIfMissing(
      target.evidence,
      "data.maxGbps",
      sourceUrl,
      llmSnippetForField(enrichment, "data.maxGbps")
    );
  }

  const llmUsbGeneration = cleanText(enrichment.data?.usbGeneration);
  if (llmUsbGeneration && !target.data.usbGeneration) {
    target.data.usbGeneration = llmUsbGeneration;
    addEvidenceIfMissing(
      target.evidence,
      "data.usbGeneration",
      sourceUrl,
      llmSnippetForField(enrichment, "data.usbGeneration")
    );
  }
};

const applyLlmVideoSignals = (
  target: ExtractionOutput,
  sourceUrl: string,
  enrichment: ShopifyJsonLlmEnrichment
): void => {
  if (
    typeof enrichment.video?.explicitlySupported === "boolean" &&
    typeof target.video.explicitlySupported !== "boolean"
  ) {
    target.video.explicitlySupported = enrichment.video.explicitlySupported;
    addEvidenceIfMissing(
      target.evidence,
      "video.explicitlySupported",
      sourceUrl,
      llmSnippetForField(enrichment, "video.explicitlySupported")
    );
  }

  const llmResolution = cleanText(enrichment.video?.maxResolution);
  if (llmResolution && !target.video.maxResolution) {
    target.video.maxResolution = llmResolution;
    addEvidenceIfMissing(
      target.evidence,
      "video.maxResolution",
      sourceUrl,
      llmSnippetForField(enrichment, "video.maxResolution")
    );
  }

  if (
    typeof enrichment.video?.maxRefreshHz === "number" &&
    typeof target.video.maxRefreshHz !== "number"
  ) {
    target.video.maxRefreshHz = enrichment.video.maxRefreshHz;
    addEvidenceIfMissing(
      target.evidence,
      "video.maxRefreshHz",
      sourceUrl,
      llmSnippetForField(enrichment, "video.maxRefreshHz")
    );
  }
};

export const shouldAttemptShopifyJsonEnrichment = (
  parsed: ExtractionOutput
): boolean => {
  if (
    isUsbCToUsbC(parsed.connectorPair.from, parsed.connectorPair.to) &&
    !(
      typeof parsed.power.maxWatts === "number" &&
      Number.isFinite(parsed.power.maxWatts) &&
      parsed.power.maxWatts > 0
    )
  ) {
    return true;
  }

  return (
    isUnknownConnector(parsed.connectorPair.from) ||
    isUnknownConnector(parsed.connectorPair.to)
  );
};

export const formatShopifyJsonInputForPrompt = (
  input: ShopifyJsonEnrichmentInput
): string => {
  return JSON.stringify(input, null, 2);
};

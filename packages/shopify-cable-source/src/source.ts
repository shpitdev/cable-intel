import type {
  ShopifyCableSourceTemplate,
  ShopifyEvidencePointer,
  ShopifyExtractedCableSpec,
  ShopifyExtractionResult,
  ShopifyProductCandidate,
} from "./types";

interface ShopifyOptionValue {
  label?: string;
  value?: string;
}

interface ShopifyOption {
  name?: string;
  values?: ShopifyOptionValue[];
}

interface ShopifyImage {
  altText?: string;
  url?: string;
}

interface ShopifyVariant {
  image?: ShopifyImage;
  name?: string;
  options?: ShopifyOption[];
  sku?: string;
}

interface ShopifyKeyFeature {
  key?: string;
  value?: string;
}

interface ShopifyProductInfos {
  key_features?: {
    list?: ShopifyKeyFeature[];
  };
}

interface ShopifyProduct {
  description?: string;
  descriptionHtml?: string;
  handle?: string;
  images?: ShopifyImage[];
  metafields?: {
    productInfos?: ShopifyProductInfos;
  };
  name?: string;
  options?: ShopifyOption[];
  title?: string;
  variants?: ShopifyVariant[];
  vendor?: string;
}

interface ShopifySearchSuggestResponse {
  resources?: {
    results?: {
      products?: Array<{
        body?: string;
        handle?: string;
        title?: string;
        url?: string;
      }>;
    };
  };
}

interface ShopifyProductJsonVariant {
  available?: boolean;
  featured_image?: {
    alt?: string;
    src?: string;
  };
  option1?: string | null;
  option2?: string | null;
  option3?: string | null;
  public_title?: string | null;
  sku?: string | null;
  title?: string | null;
}

interface ShopifyProductJson {
  body_html?: string;
  handle?: string;
  images?: string[];
  options?: Array<
    | string
    | {
        name?: string;
        values?: string[];
      }
  >;
  title?: string;
  variants?: ShopifyProductJsonVariant[];
  vendor?: string;
}

interface NextDataDocument {
  buildId?: string;
  pageProps?: {
    product?: ShopifyProduct;
    [key: string]: unknown;
  };
  props?: {
    pageProps?: {
      product?: ShopifyProduct;
      [key: string]: unknown;
    };
  };
}

interface ConnectorPairResult {
  evidenceSnippet: string;
  from: string;
  to: string;
}

interface ProductExtractionContext {
  brand: string;
  canonicalUrl: string;
  connectorPair: ConnectorPairResult;
  data: {
    maxGbps?: number;
    usbGeneration?: string;
  };
  imageUrls: string[];
  markdown: string;
  model: string;
  power: {
    eprSupported?: boolean;
    maxWatts?: number;
    pdSupported?: boolean;
  };
  sourceText: string;
  variants: ShopifyVariant[];
  video: {
    explicitlySupported?: boolean;
    maxRefreshHz?: number;
    maxResolution?: string;
  };
}

class HttpError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const NEXT_DATA_SCRIPT_REGEX =
  /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/;
const CONNECTOR_TOKEN_REGEX =
  /(Thunderbolt\s*\d*|USB[-\s]?C|USB[-\s]?A|USB\s*3\.0|Lightning|Micro[-\s]?USB)/i;
const CONNECTOR_PAIR_REGEX =
  /(Thunderbolt\s*\d*|USB[-\s]?C|USB[-\s]?A|USB\s*3\.0|Lightning|Micro[-\s]?USB)\s*to\s*(Thunderbolt\s*\d*|USB[-\s]?C|USB[-\s]?A|USB\s*3\.0|Lightning|Micro[-\s]?USB)/i;
const THUNDERBOLT_WORD_REGEX = /thunderbolt/i;
const CABLE_WORD_REGEX = /cable/i;
const POWER_REGEX = /(\d{1,3}(?:\.\d+)?)\s*W\b/gi;
const POWER_HINT_REGEX = /(\d{1,3}(?:\.\d+)?)\s*W\b/i;
const DATA_RATE_REGEX = /(\d{1,3}(?:\.\d+)?)\s*Gbps\b/gi;
const DATA_RATE_HINT_REGEX = /(\d{1,3}(?:\.\d+)?)\s*Gbps\b/i;
const THUNDERBOLT_REGEX = /Thunderbolt\s*(\d+)/i;
const USB_GENERATION_REGEX = /USB\s*(\d(?:\.\d)?)/i;
const PD_REGEX = /\bPD\b|Power Delivery/i;
const EPR_REGEX = /\bEPR\b/i;
const VIDEO_NEGATIVE_REGEX =
  /does\s+not\s+support\s+screen\s+mirroring|not\s+support\s+screen\s+mirroring/i;
const VIDEO_POSITIVE_REGEX =
  /screen\s+mirroring|display\s+support|video\s+output|supports\s+video/i;
const RESOLUTION_REGEX = /(8K|5K|4K|2K|1080p)/i;
const REFRESH_RATE_REGEX = /(\d{2,3})\s*Hz\b/i;
const LIGHTNING_MAX_GBPS = 0.48 as const;
const LIGHTNING_USB_GENERATION = "USB 2.0 (Lightning ceiling)" as const;
const VARIANT_LENGTH_HINT_REGEX =
  /\b(\d+(?:\.\d+)?)\s*(ft|feet|m|cm|mm|in|inch|inches)\b/i;
const FETCH_TIMEOUT_MS = 25_000;
const UNKNOWN_BRAND_TOKENS = new Set([
  "",
  "unknown",
  "n/a",
  "na",
  "none",
  "null",
]);

const stripTags = (value: string): string => {
  return value.replace(/<[^>]+>/g, " ");
};

const normalizeWhitespace = (value: string): string => {
  return value.replace(/\s+/g, " ").trim();
};

const cleanText = (value: string | undefined | null): string => {
  if (typeof value !== "string") {
    return "";
  }
  return normalizeWhitespace(stripTags(value));
};

const combineUniqueText = (...segments: Array<string | undefined>): string => {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const segment of segments) {
    const cleaned = cleanText(segment);
    if (!cleaned) {
      continue;
    }

    const normalized = cleaned.toLowerCase();
    if (seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    unique.push(cleaned);
  }

  return unique.join("\n");
};

const slugify = (value: string): string => {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
};

const normalizeBrand = (vendor: string, fallbackBrand: string): string => {
  const cleanedVendor = cleanText(vendor);
  const cleanedFallback = cleanText(fallbackBrand);
  if (!cleanedFallback) {
    return cleanedVendor;
  }
  if (!cleanedVendor) {
    return cleanedFallback;
  }

  if (UNKNOWN_BRAND_TOKENS.has(cleanedVendor.toLowerCase())) {
    return cleanedFallback;
  }

  const vendorSlug = slugify(cleanedVendor);
  const fallbackSlug = slugify(cleanedFallback);
  if (!vendorSlug) {
    return cleanedFallback;
  }

  if (
    vendorSlug === fallbackSlug ||
    vendorSlug.includes(fallbackSlug) ||
    vendorSlug.startsWith("beta-")
  ) {
    return cleanedFallback;
  }

  return cleanedVendor;
};

const ensureBrandInModel = (brand: string, model: string): string => {
  const cleanedBrand = cleanText(brand);
  const cleanedModel = cleanText(model);
  if (!cleanedBrand) {
    return cleanedModel;
  }
  if (!cleanedModel) {
    return cleanedBrand;
  }
  if (cleanedModel.toLowerCase().includes(cleanedBrand.toLowerCase())) {
    return cleanedModel;
  }
  return `${cleanedBrand} ${cleanedModel}`;
};

const escapeHtml = (value: string): string => {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
};

const toSafeHtmlParagraph = (value: string): string => {
  return `<p>${escapeHtml(value)}</p>`;
};

const hasCapabilitySignals = (text: string): boolean => {
  return (
    POWER_HINT_REGEX.test(text) ||
    DATA_RATE_HINT_REGEX.test(text) ||
    PD_REGEX.test(text) ||
    VIDEO_POSITIVE_REGEX.test(text) ||
    VIDEO_NEGATIVE_REGEX.test(text)
  );
};

const dedupeUrls = (urls: readonly string[]): string[] => {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const value of urls) {
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }
    try {
      const withProtocol = trimmed.startsWith("//")
        ? `https:${trimmed}`
        : trimmed;
      const normalized = new URL(withProtocol).toString();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        deduped.push(normalized);
      }
    } catch {
      // Ignore invalid image URLs from source payloads.
    }
  }
  return deduped;
};

const fetchWithTimeout = async (
  url: string,
  init?: RequestInit
): Promise<Response> => {
  try {
    return await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error(`Timed out fetching Shopify endpoint: ${url}`);
    }
    throw error;
  }
};

const getSnippet = (
  text: string,
  matcher: RegExp | string
): string | undefined => {
  const haystack = normalizeWhitespace(text);
  if (!haystack) {
    return undefined;
  }

  if (typeof matcher === "string") {
    const index = haystack.toLowerCase().indexOf(matcher.toLowerCase());
    if (index < 0) {
      return undefined;
    }
    const start = Math.max(index - 80, 0);
    const end = Math.min(index + matcher.length + 80, haystack.length);
    return haystack.slice(start, end);
  }

  const pattern = new RegExp(matcher.source, matcher.flags.replaceAll("g", ""));
  const match = pattern.exec(haystack);
  if (!match || match.index < 0) {
    return undefined;
  }

  const start = Math.max(match.index - 80, 0);
  const end = Math.min(match.index + match[0].length + 80, haystack.length);
  return haystack.slice(start, end);
};

const parseNextDataFromHtml = (html: string): NextDataDocument => {
  const match = html.match(NEXT_DATA_SCRIPT_REGEX);
  if (!match?.[1]) {
    throw new Error("Missing __NEXT_DATA__ script in Shopify page");
  }

  return JSON.parse(match[1]) as NextDataDocument;
};

const toNextDataJsonPath = (pathname: string): string => {
  const withoutTrailingSlash =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname;

  if (withoutTrailingSlash === "/") {
    return "/index.json";
  }

  return `${withoutTrailingSlash}.json`;
};

const collectCandidates = (value: unknown): ShopifyProductCandidate[] => {
  const byHandle = new Map<string, ShopifyProductCandidate>();

  const visit = (node: unknown): void => {
    if (!node) {
      return;
    }

    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item);
      }
      return;
    }

    if (typeof node !== "object") {
      return;
    }

    const candidate = node as {
      handle?: unknown;
      name?: unknown;
      title?: unknown;
      variants?: unknown;
    };

    if (
      typeof candidate.handle === "string" &&
      typeof (candidate.title ?? candidate.name) === "string" &&
      Array.isArray(candidate.variants)
    ) {
      byHandle.set(candidate.handle, {
        handle: candidate.handle,
        title: String(candidate.title ?? candidate.name),
      });
    }

    for (const nestedValue of Object.values(candidate)) {
      visit(nestedValue);
    }
  };

  visit(value);
  return [...byHandle.values()];
};

const getProductFromNextData = (
  payload: NextDataDocument
): ShopifyProduct | null => {
  return (
    payload.props?.pageProps?.product ?? payload.pageProps?.product ?? null
  );
};

const toProductJsonVariantLabel = (
  variant: ShopifyProductJsonVariant
): string | undefined => {
  const publicTitle = cleanText(variant.public_title ?? undefined);
  if (publicTitle && publicTitle.toLowerCase() !== "default title") {
    return publicTitle;
  }

  const title = cleanText(variant.title ?? undefined);
  if (title && title.toLowerCase() !== "default title") {
    return title;
  }

  return undefined;
};

const mapProductJsonToShopifyProduct = (
  product: ShopifyProductJson
): ShopifyProduct => {
  const optionNames = Array.isArray(product.options) ? product.options : [];
  const variants = Array.isArray(product.variants) ? product.variants : [];

  const mappedVariants: ShopifyVariant[] = variants.map((variant) => {
    const optionValues = [variant.option1, variant.option2, variant.option3]
      .map((value) => cleanText(value ?? undefined))
      .filter(Boolean);

    const mappedOptions: ShopifyOption[] = [];
    for (const [index, name] of optionNames.entries()) {
      const optionValue = optionValues[index];
      if (!optionValue) {
        continue;
      }
      const optionName =
        typeof name === "string" ? name : cleanText(name?.name);
      mappedOptions.push({
        name: cleanText(optionName),
        values: [{ label: optionValue }],
      });
    }

    return {
      name: toProductJsonVariantLabel(variant),
      options: mappedOptions,
      sku: cleanText(variant.sku ?? undefined) || undefined,
      image: {
        altText: cleanText(variant.featured_image?.alt),
        url: cleanText(variant.featured_image?.src),
      },
    };
  });

  return {
    description: cleanText(product.body_html),
    descriptionHtml: product.body_html,
    handle: cleanText(product.handle),
    images: (product.images ?? []).map((url) => ({
      url: cleanText(url),
    })),
    name: cleanText(product.title),
    title: cleanText(product.title),
    variants: mappedVariants,
    vendor: cleanText(product.vendor),
  };
};

const normalizeConnectorToken = (token: string): string | null => {
  const normalized = token.toLowerCase().replace(/\s+/g, "");
  if (normalized.includes("thunderbolt")) {
    return "USB-C";
  }
  if (normalized.includes("lightning")) {
    return "Lightning";
  }
  if (normalized.includes("micro")) {
    return "Micro-USB";
  }
  if (normalized.includes("usb3.0") || normalized.includes("usb-a")) {
    return "USB-A";
  }
  if (normalized.includes("usb-c") || normalized.includes("usbc")) {
    return "USB-C";
  }
  return null;
};

const extractConnectorPairFromText = (
  text: string
): { from: string; matchedText: string; to: string } | null => {
  const pairMatch = text.match(CONNECTOR_PAIR_REGEX);
  if (!(pairMatch?.[1] && pairMatch[2])) {
    return null;
  }

  const from = normalizeConnectorToken(pairMatch[1]);
  const to = normalizeConnectorToken(pairMatch[2]);
  if (!(from && to)) {
    return null;
  }

  return {
    from,
    to,
    matchedText: pairMatch[0],
  };
};

const collectNormalizedConnectors = (text: string): string[] => {
  const connectorMatcher = new RegExp(CONNECTOR_TOKEN_REGEX.source, "gi");
  const connectors = new Set<string>();
  let connectorMatch = connectorMatcher.exec(text);
  while (connectorMatch) {
    const normalized = normalizeConnectorToken(
      connectorMatch[1] ?? connectorMatch[0]
    );
    if (normalized) {
      connectors.add(normalized);
    }
    connectorMatch = connectorMatcher.exec(text);
  }
  return [...connectors];
};

const parseConnectorPair = (
  title: string,
  contextText: string
): ConnectorPairResult => {
  const titlePair = extractConnectorPairFromText(title);
  if (titlePair) {
    return {
      from: titlePair.from,
      to: titlePair.to,
      evidenceSnippet: getSnippet(title, titlePair.matchedText) ?? title,
    };
  }

  const contextPair = extractConnectorPairFromText(contextText);
  if (contextPair) {
    return {
      from: contextPair.from,
      to: contextPair.to,
      evidenceSnippet:
        getSnippet(contextText, contextPair.matchedText) ?? contextText,
    };
  }

  if (THUNDERBOLT_WORD_REGEX.test(title) && CABLE_WORD_REGEX.test(title)) {
    return {
      from: "USB-C",
      to: "USB-C",
      evidenceSnippet: getSnippet(title, THUNDERBOLT_WORD_REGEX) ?? title,
    };
  }

  const connectors = collectNormalizedConnectors(`${title} ${contextText}`);
  if (connectors.length === 0) {
    return {
      from: "USB-C",
      to: "USB-C",
      evidenceSnippet: title,
    };
  }

  if (connectors.length === 1) {
    const connector = connectors[0] ?? "USB-C";
    return {
      from: connector,
      to: connector,
      evidenceSnippet: getSnippet(title, connector) ?? title,
    };
  }

  return {
    from: connectors[0] ?? "USB-C",
    to: connectors[1] ?? connectors[0] ?? "USB-C",
    evidenceSnippet: title,
  };
};

const getPowerCapability = (text: string) => {
  const watts = [...text.matchAll(POWER_REGEX)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value) && value > 0 && value <= 500);

  return {
    maxWatts: watts.length > 0 ? Math.max(...watts) : undefined,
    pdSupported: PD_REGEX.test(text) ? true : undefined,
    eprSupported: EPR_REGEX.test(text) ? true : undefined,
  };
};

const getDataCapability = (
  text: string,
  connectorPair: { from: string; to: string }
) => {
  const isLightningCable =
    connectorPair.from === "Lightning" || connectorPair.to === "Lightning";
  const speeds = [...text.matchAll(DATA_RATE_REGEX)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value) && value > 0);

  const thunderbolt = isLightningCable ? null : text.match(THUNDERBOLT_REGEX);
  const usbGenerationMatch = text.match(USB_GENERATION_REGEX);

  let usbGeneration: string | undefined;
  if (thunderbolt?.[1]) {
    usbGeneration = `Thunderbolt ${thunderbolt[1]}`;
  } else if (usbGenerationMatch?.[1]) {
    usbGeneration = `USB ${usbGenerationMatch[1]}`;
  }

  let maxGbps: number | undefined;
  if (speeds.length > 0) {
    maxGbps = Math.max(...speeds);
  } else if (isLightningCable) {
    maxGbps = LIGHTNING_MAX_GBPS;
  }

  if (isLightningCable) {
    return {
      maxGbps:
        typeof maxGbps === "number"
          ? Math.min(maxGbps, LIGHTNING_MAX_GBPS)
          : LIGHTNING_MAX_GBPS,
      usbGeneration: LIGHTNING_USB_GENERATION,
    };
  }

  return {
    maxGbps,
    usbGeneration,
  };
};

const getVideoCapability = (text: string) => {
  let explicitlySupported: boolean | undefined;
  if (VIDEO_NEGATIVE_REGEX.test(text)) {
    explicitlySupported = false;
  } else if (VIDEO_POSITIVE_REGEX.test(text)) {
    explicitlySupported = true;
  }
  const resolutionMatch = text.match(RESOLUTION_REGEX);
  const refreshRateMatch = text.match(REFRESH_RATE_REGEX);

  return {
    explicitlySupported,
    maxRefreshHz: refreshRateMatch?.[1]
      ? Number(refreshRateMatch[1])
      : undefined,
    maxResolution: resolutionMatch?.[1]?.toUpperCase(),
  };
};

const getKeyFeatureText = (product: ShopifyProduct): string[] => {
  const keyFeatures = product.metafields?.productInfos?.key_features?.list;
  if (!Array.isArray(keyFeatures)) {
    return [];
  }

  const lines: string[] = [];
  for (const feature of keyFeatures) {
    const key = cleanText(feature.key);
    const value = cleanText(feature.value);
    if (!(key || value)) {
      continue;
    }
    lines.push(key && value ? `${key}: ${value}` : `${key}${value}`);
  }

  return lines;
};

const getImageAltText = (product: ShopifyProduct): string[] => {
  const imageAltText = [
    ...(product.images ?? []).map((image) => cleanText(image.altText)),
    ...(product.variants ?? []).map((variant) =>
      cleanText(variant.image?.altText)
    ),
  ];

  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const value of imageAltText) {
    if (!value) {
      continue;
    }
    const normalized = value.toLowerCase();
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    deduped.push(value);
  }

  return deduped;
};

const buildMarkdownSource = (
  brand: string,
  model: string,
  handle: string,
  description: string,
  keyFeatures: readonly string[],
  variants: readonly ShopifyVariant[]
): string => {
  const lines: string[] = [
    `# ${model}`,
    `- Brand: ${brand}`,
    `- Handle: ${handle}`,
  ];

  if (description) {
    lines.push(`- Description: ${description}`);
  }

  if (keyFeatures.length > 0) {
    lines.push("", "## Key Features");
    for (const feature of keyFeatures) {
      lines.push(`- ${feature}`);
    }
  }

  if (variants.length > 0) {
    lines.push("", "## Variants");
    for (const variant of variants) {
      const label = cleanText(variant.name);
      const sku = cleanText(variant.sku);
      if (label || sku) {
        lines.push(`- ${label || "Variant"}${sku ? ` (SKU: ${sku})` : ""}`);
      }
    }
  }

  return lines.join("\n");
};

const getHandleFromProductUrl = (
  template: ShopifyCableSourceTemplate,
  url: URL
): string | null => {
  const normalizedPath = url.pathname.toLowerCase();
  const marker = template.productPathPrefix.toLowerCase();
  const markerIndex = normalizedPath.indexOf(marker);
  if (markerIndex < 0) {
    return null;
  }

  const pathFromMarker = url.pathname.slice(markerIndex + marker.length);
  const handle = decodeURIComponent(pathFromMarker.split("/")[0] ?? "").trim();
  return handle || null;
};

const getVariantLabel = (
  variant: ShopifyVariant,
  variantCount: number,
  model: string
): string | undefined => {
  const label = cleanText(variant.name);
  const sku = cleanText(variant.sku);
  const optionLabels = (variant.options ?? [])
    .flatMap((option) => option.values ?? [])
    .map((value) => cleanText(value.label ?? value.value))
    .filter((value) => value && value.toLowerCase() !== "default title");
  const optionLabel = optionLabels.length > 0 ? optionLabels.join(" / ") : null;

  if (!label || label.toLowerCase() === "default title") {
    if (optionLabel) {
      return optionLabel;
    }

    if (variantCount === 1) {
      const parenthetical = [...model.matchAll(/\(([^()]{1,48})\)/g)]
        .map((match) => cleanText(match[1]))
        .find(Boolean);
      if (parenthetical) {
        return parenthetical;
      }
      const lengthHint = cleanText(model.match(VARIANT_LENGTH_HINT_REGEX)?.[0]);
      if (lengthHint) {
        return lengthHint;
      }
      return sku || undefined;
    }

    return undefined;
  }
  return label;
};

const extractMaxWatts = (text: string): number | undefined => {
  const watts = [...text.matchAll(POWER_REGEX)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value) && value > 0 && value <= 500);
  if (watts.length === 0) {
    return undefined;
  }
  return Math.max(...watts);
};

const getVariantPowerCapability = (
  basePower: ProductExtractionContext["power"],
  variantLabel?: string
): ProductExtractionContext["power"] => {
  const variantWatts = extractMaxWatts(variantLabel ?? "");
  if (typeof variantWatts !== "number") {
    return basePower;
  }
  return {
    ...basePower,
    maxWatts: variantWatts,
  };
};

const buildProductExtractionContext = (
  template: ShopifyCableSourceTemplate,
  productPath: string,
  product: ShopifyProduct,
  supplementalDescription?: string
): ProductExtractionContext => {
  const brand = normalizeBrand(product.vendor ?? "", template.name);
  const rawModel = cleanText(product.title ?? product.name);
  const model = ensureBrandInModel(brand, rawModel);
  const description = combineUniqueText(
    product.description,
    product.descriptionHtml,
    supplementalDescription
  );
  const keyFeatures = getKeyFeatureText(product);
  const imageAltText = getImageAltText(product);
  const contextText = [model, description, ...keyFeatures].join("\n");
  const powerContextText = [contextText, ...imageAltText].join("\n");
  const connectorPair = parseConnectorPair(model, contextText);
  const data = getDataCapability(contextText, connectorPair);
  const power = getPowerCapability(powerContextText);
  const variants = Array.isArray(product.variants)
    ? product.variants
    : ([{}] as ShopifyVariant[]);

  const canonicalUrl = new URL(productPath, template.baseUrl).toString();
  const imageUrls = dedupeUrls(
    [
      ...variants.map((variant) => cleanText(variant.image?.url)),
      ...(product.images ?? []).map((image) => cleanText(image.url)),
    ].filter(Boolean)
  );

  const markdown = buildMarkdownSource(
    brand,
    model,
    cleanText(product.handle) || productPath,
    description,
    keyFeatures,
    variants
  );

  const sourceText = [
    model,
    description,
    ...keyFeatures,
    ...imageAltText,
    markdown,
  ].join("\n");

  return {
    brand,
    canonicalUrl,
    connectorPair,
    data,
    imageUrls,
    markdown,
    model,
    power,
    sourceText,
    variants,
    video: getVideoCapability(contextText),
  };
};

const buildEvidence = (
  context: ProductExtractionContext,
  options?: {
    power?: ProductExtractionContext["power"];
    variantLabel?: string;
  }
): ShopifyEvidencePointer[] => {
  const effectivePower = options?.power ?? context.power;
  const variantLabel = options?.variantLabel;
  const evidence: ShopifyEvidencePointer[] = [
    {
      fieldPath: "brand",
      snippet: context.brand,
      sourceUrl: context.canonicalUrl,
    },
    {
      fieldPath: "model",
      snippet: context.model,
      sourceUrl: context.canonicalUrl,
    },
    {
      fieldPath: "connectorPair.from",
      snippet: context.connectorPair.evidenceSnippet,
      sourceUrl: context.canonicalUrl,
    },
    {
      fieldPath: "connectorPair.to",
      snippet: context.connectorPair.evidenceSnippet,
      sourceUrl: context.canonicalUrl,
    },
  ];

  if (typeof effectivePower.maxWatts === "number") {
    const powerSnippet =
      getSnippet(
        `${context.model} ${variantLabel ?? ""}`,
        `${effectivePower.maxWatts}W`
      ) ??
      getSnippet(context.sourceText, `${effectivePower.maxWatts}W`) ??
      getSnippet(context.sourceText, POWER_REGEX);
    if (powerSnippet) {
      evidence.push({
        fieldPath: "power.maxWatts",
        snippet: powerSnippet,
        sourceUrl: context.canonicalUrl,
      });
    }
  }

  if (typeof context.data.maxGbps === "number") {
    const dataSnippet =
      getSnippet(context.sourceText, `${context.data.maxGbps}Gbps`) ??
      getSnippet(context.sourceText, DATA_RATE_REGEX);
    if (dataSnippet) {
      evidence.push({
        fieldPath: "data.maxGbps",
        snippet: dataSnippet,
        sourceUrl: context.canonicalUrl,
      });
    }
  }

  if (typeof context.video.explicitlySupported === "boolean") {
    const matcher = context.video.explicitlySupported
      ? VIDEO_POSITIVE_REGEX
      : VIDEO_NEGATIVE_REGEX;
    const videoSnippet = getSnippet(context.sourceText, matcher);
    if (videoSnippet) {
      evidence.push({
        fieldPath: "video.explicitlySupported",
        snippet: videoSnippet,
        sourceUrl: context.canonicalUrl,
      });
    }
  }

  return evidence;
};

const buildCableSpecs = (
  context: ProductExtractionContext
): ShopifyExtractedCableSpec[] => {
  return context.variants.map((variant) => {
    const variantLabel = getVariantLabel(
      variant,
      context.variants.length,
      context.model
    );
    const power = getVariantPowerCapability(context.power, variantLabel);
    const evidence = buildEvidence(context, {
      power,
      variantLabel,
    });
    const variantImageUrl = cleanText(variant.image?.url);
    const images = dedupeUrls([
      ...(variantImageUrl ? [variantImageUrl] : []),
      ...context.imageUrls,
    ]).map((url) => ({ url }));

    return {
      brand: context.brand,
      connectorPair: {
        from: context.connectorPair.from,
        to: context.connectorPair.to,
      },
      data: context.data,
      evidence,
      images,
      model: context.model,
      power,
      sku: cleanText(variant.sku) || undefined,
      variant: variantLabel,
      video: context.video,
    };
  });
};

const buildExtractionResultFromProduct = (
  template: ShopifyCableSourceTemplate,
  productPath: string,
  product: ShopifyProduct,
  supplementalDescription?: string
): ShopifyExtractionResult => {
  const context = buildProductExtractionContext(
    template,
    productPath,
    product,
    supplementalDescription
  );
  const descriptionText = combineUniqueText(
    product.descriptionHtml,
    product.description,
    supplementalDescription
  );
  const html = descriptionText
    ? toSafeHtmlParagraph(descriptionText)
    : toSafeHtmlParagraph(context.markdown);

  return {
    cables: buildCableSpecs(context),
    source: {
      canonicalUrl: context.canonicalUrl,
      fetchedAt: Date.now(),
      html,
      markdown: context.markdown,
      url: context.canonicalUrl,
    },
  };
};

export interface ShopifyCableSource {
  discoverProductUrls: (maxItems?: number) => Promise<string[]>;
  extractFromProductUrl: (
    url: string
  ) => Promise<ShopifyExtractionResult | null>;
  readonly template: ShopifyCableSourceTemplate;
}

export const createShopifyCableSource = (
  template: ShopifyCableSourceTemplate
): ShopifyCableSource => {
  let cachedBuildId: string | undefined;
  let loadedSearchCatalogForTemplateQuery = false;
  let suggestEndpointUnsupported = false;
  const suggestProductByHandle = new Map<
    string,
    {
      body: string;
      title: string;
      url: string;
    }
  >();

  const isRecoverableNextDataError = (error: unknown): boolean => {
    if (error instanceof HttpError && error.status === 404) {
      return true;
    }
    if (error instanceof Error) {
      return error.message.includes("Missing __NEXT_DATA__");
    }
    return false;
  };

  const getBuildId = async (): Promise<string> => {
    if (cachedBuildId) {
      return cachedBuildId;
    }

    const searchUrl = new URL(template.searchPath, template.baseUrl);
    searchUrl.searchParams.set(
      template.searchQueryParam,
      template.searchQueryValue
    );

    const response = await fetchWithTimeout(searchUrl.toString());
    if (!response.ok) {
      throw new HttpError(
        `Failed to fetch search page (${response.status})`,
        response.status
      );
    }

    const html = await response.text();
    const nextData = parseNextDataFromHtml(html);
    if (!nextData.buildId) {
      throw new Error(`Unable to resolve Next.js build ID for ${template.id}`);
    }

    cachedBuildId = nextData.buildId;
    return cachedBuildId;
  };

  const indexSearchSuggestProducts = (
    payload: ShopifySearchSuggestResponse
  ): Array<{
    body: string;
    handle: string;
    title: string;
    url: string;
  }> => {
    const products = payload.resources?.results?.products;
    if (!Array.isArray(products)) {
      return [];
    }

    const indexedProducts: Array<{
      body: string;
      handle: string;
      title: string;
      url: string;
    }> = [];

    for (const product of products) {
      const handle = cleanText(product.handle);
      const title = cleanText(product.title);
      if (!(handle && title)) {
        continue;
      }

      const body = cleanText(product.body);
      const url = cleanText(product.url);

      suggestProductByHandle.set(handle.toLowerCase(), {
        body,
        title,
        url,
      });

      indexedProducts.push({
        body,
        handle,
        title,
        url,
      });
    }

    return indexedProducts;
  };

  const fetchSearchSuggestProducts = async (
    query: string
  ): Promise<
    Array<{
      body: string;
      handle: string;
      title: string;
      url: string;
    }>
  > => {
    const suggestUrl = new URL("/search/suggest.json", template.baseUrl);
    suggestUrl.searchParams.set("q", query);
    suggestUrl.searchParams.set("resources[type]", "product");
    suggestUrl.searchParams.set("resources[limit]", "250");
    suggestUrl.searchParams.set(
      "resources[options][unavailable_products]",
      "last"
    );

    const response = await fetchWithTimeout(suggestUrl.toString(), {
      headers: {
        accept: "application/json",
      },
    });
    if (!response.ok) {
      throw new HttpError(
        `Failed to fetch search suggest endpoint (${response.status})`,
        response.status
      );
    }

    const payload = (await response.json()) as ShopifySearchSuggestResponse;
    return indexSearchSuggestProducts(payload);
  };

  const tryFetchSearchSuggestProducts = async (
    query: string
  ): Promise<
    Array<{
      body: string;
      handle: string;
      title: string;
      url: string;
    }>
  > => {
    if (suggestEndpointUnsupported) {
      return [];
    }

    try {
      return await fetchSearchSuggestProducts(query);
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) {
        suggestEndpointUnsupported = true;
        return [];
      }
      throw error;
    }
  };

  const fetchSearchSuggestCandidates = async (): Promise<
    ShopifyProductCandidate[]
  > => {
    const products = await tryFetchSearchSuggestProducts(
      template.searchQueryValue
    );
    loadedSearchCatalogForTemplateQuery = true;

    return products
      .map((product) => ({
        handle: cleanText(product.handle),
        summaryHtml: cleanText(product.body),
        title: cleanText(product.title),
      }))
      .filter((product) => product.handle && product.title);
  };

  const shouldSkipSupplementalLookup = (product: ShopifyProduct): boolean => {
    const baseDescription = combineUniqueText(
      product.description,
      product.descriptionHtml
    );
    return (
      baseDescription.length >= 140 && hasCapabilitySignals(baseDescription)
    );
  };

  const getSuggestDescriptionFromCache = (normalizedHandle: string): string => {
    const cached = suggestProductByHandle.get(normalizedHandle);
    return cached ? combineUniqueText(cached.title, cached.body) : "";
  };

  const getSuggestDescriptionFromProducts = (
    products: Array<{
      body: string;
      handle: string;
      title: string;
      url: string;
    }>,
    normalizedHandle: string
  ): string => {
    for (const item of products) {
      if (item.handle.toLowerCase() === normalizedHandle) {
        return combineUniqueText(item.title, item.body);
      }
    }
    return "";
  };

  const getSearchSuggestSupplementalDescription = async (
    handle: string,
    product: ShopifyProduct
  ): Promise<string> => {
    if (suggestEndpointUnsupported) {
      return "";
    }

    const normalizedHandle = cleanText(handle).toLowerCase();
    if (!normalizedHandle) {
      return "";
    }
    if (shouldSkipSupplementalLookup(product)) {
      return "";
    }

    const cachedDescription = getSuggestDescriptionFromCache(normalizedHandle);
    if (cachedDescription) {
      return cachedDescription;
    }

    const byHandleResults = await tryFetchSearchSuggestProducts(handle);
    const byHandleDescription = getSuggestDescriptionFromProducts(
      byHandleResults,
      normalizedHandle
    );
    if (byHandleDescription) {
      return byHandleDescription;
    }

    if (!loadedSearchCatalogForTemplateQuery) {
      loadedSearchCatalogForTemplateQuery = true;
      const fallbackResults = await tryFetchSearchSuggestProducts(
        template.searchQueryValue
      );
      return getSuggestDescriptionFromProducts(
        fallbackResults,
        normalizedHandle
      );
    }

    return "";
  };

  const fetchNextData = async (
    pathname: string,
    searchParams?: URLSearchParams
  ): Promise<NextDataDocument> => {
    const fetchWithBuildId = async (
      buildId: string
    ): Promise<NextDataDocument> => {
      const nextDataUrl = new URL(
        `/_next/data/${buildId}${toNextDataJsonPath(pathname)}`,
        template.baseUrl
      );
      if (searchParams) {
        nextDataUrl.search = searchParams.toString();
      }

      const response = await fetchWithTimeout(nextDataUrl.toString());
      if (!response.ok) {
        throw new HttpError(
          `Failed to fetch Next data (${response.status}) for ${pathname}`,
          response.status
        );
      }

      return (await response.json()) as NextDataDocument;
    };

    const buildId = await getBuildId();
    try {
      return await fetchWithBuildId(buildId);
    } catch (error) {
      if (!(error instanceof HttpError) || error.status !== 404) {
        throw error;
      }

      cachedBuildId = undefined;
      const refreshedBuildId = await getBuildId();
      return await fetchWithBuildId(refreshedBuildId);
    }
  };

  const fetchProductJson = async (
    handle: string
  ): Promise<ShopifyProduct | null> => {
    const productJsonUrl = new URL(
      `${template.productPathPrefix}${handle}.js`,
      template.baseUrl
    );
    const response = await fetchWithTimeout(productJsonUrl.toString(), {
      headers: {
        accept: "application/json",
      },
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new HttpError(
        `Failed to fetch Shopify product JSON (${response.status})`,
        response.status
      );
    }

    const payload = (await response.json()) as ShopifyProductJson;
    return mapProductJsonToShopifyProduct(payload);
  };

  const discoverProductUrls = async (maxItems = 200): Promise<string[]> => {
    let candidates: ShopifyProductCandidate[] = [];

    try {
      const searchParams = new URLSearchParams();
      searchParams.set(template.searchQueryParam, template.searchQueryValue);

      const searchPayload = await fetchNextData(
        template.searchPath,
        searchParams
      );
      const pageProps =
        searchPayload.props?.pageProps ??
        searchPayload.pageProps ??
        searchPayload;
      candidates = collectCandidates(pageProps);
    } catch (error) {
      if (!isRecoverableNextDataError(error)) {
        throw error;
      }
    }

    if (candidates.length === 0) {
      candidates = await fetchSearchSuggestCandidates();
    }

    const productUrls = candidates
      .filter((candidate) => template.includeCandidate(candidate))
      .map((candidate) => {
        return new URL(
          `${template.productPathPrefix}${candidate.handle}`,
          template.baseUrl
        ).toString();
      });

    return [...new Set(productUrls)].slice(0, Math.max(maxItems, 0));
  };

  const extractFromProductUrl = async (
    productUrl: string
  ): Promise<ShopifyExtractionResult | null> => {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(productUrl);
    } catch {
      return null;
    }

    if (!template.matchesProductUrl(parsedUrl)) {
      return null;
    }

    const handle = getHandleFromProductUrl(template, parsedUrl);
    if (!handle) {
      return null;
    }

    const productPath = `${template.productPathPrefix}${handle}`;

    let product: ShopifyProduct | null = null;
    try {
      const payload = await fetchNextData(productPath);
      product = getProductFromNextData(payload);
    } catch (error) {
      if (!isRecoverableNextDataError(error)) {
        throw error;
      }
    }

    if (!product) {
      product = await fetchProductJson(handle);
    }

    if (!product) {
      return null;
    }

    const supplementalDescription =
      await getSearchSuggestSupplementalDescription(handle, product);

    return buildExtractionResultFromProduct(
      template,
      productPath,
      product,
      supplementalDescription
    );
  };

  return {
    discoverProductUrls,
    extractFromProductUrl,
    template,
  };
};

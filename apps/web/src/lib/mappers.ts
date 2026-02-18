import {
  clampDataCapabilityByConnector,
  inferMaxGbpsFromGeneration,
  normalizeConnector,
  parsePositiveNumber,
} from "$lib/capability";
import type { CableProfile, CatalogCableRow, MarkingsDraft } from "$lib/types";

const MARKDOWN_DECORATION_REGEX = /[*_`#]/g;
const MODEL_NUMBER_PREFIX_REGEX = /^model number:\s*/i;
const WHITESPACE_REGEX = /\s+/g;
const BRAND_SLUG_REGEX = /-?anker-?/gi;
const TOKEN_SPLIT_REGEX = /[\s-]+/;
const DIGIT_REGEX = /\d/;
const MODEL_CODE_REGEX = /^[a-z0-9]+(?:[/-][a-z0-9]+)*$/i;

const toTitleCase = (value: string): string => {
  return value
    .split(TOKEN_SPLIT_REGEX)
    .filter(Boolean)
    .map((token) => {
      const lower = token.toLowerCase();
      if (lower === "usb" || lower === "pd" || lower === "tb") {
        return token.toUpperCase();
      }
      if (lower.length <= 2 && DIGIT_REGEX.test(lower)) {
        return token.toUpperCase();
      }
      return `${lower[0]?.toUpperCase() ?? ""}${lower.slice(1)}`;
    })
    .join(" ");
};

const cleanEvidenceSnippet = (value?: string): string | undefined => {
  if (!value) {
    return undefined;
  }

  const cleaned = value
    .replaceAll(MARKDOWN_DECORATION_REGEX, "")
    .replace(MODEL_NUMBER_PREFIX_REGEX, "")
    .replaceAll(WHITESPACE_REGEX, " ")
    .trim();
  return cleaned || undefined;
};

const getSlugTitle = (productUrl?: string): string | undefined => {
  if (!productUrl) {
    return undefined;
  }

  try {
    const url = new URL(productUrl);
    const slug = url.pathname.split("/").filter(Boolean).at(-1);
    if (!slug) {
      return undefined;
    }

    const withoutBrand = slug
      .replace(BRAND_SLUG_REGEX, "")
      .replaceAll("--", "-");
    const normalized = withoutBrand.replaceAll("-", " ").trim();
    if (!normalized) {
      return undefined;
    }
    return toTitleCase(normalized);
  } catch {
    return undefined;
  }
};

const getDisplayName = (row: CatalogCableRow): string => {
  const model = row.model.trim();
  const brand = row.brand.trim();

  const modelEvidence = row.evidenceRefs?.find(
    (evidence) => evidence.fieldPath === "model"
  )?.snippet;
  const brandEvidence = row.evidenceRefs?.find(
    (evidence) => evidence.fieldPath === "brand"
  )?.snippet;

  const modelEvidenceTitle = cleanEvidenceSnippet(modelEvidence);
  const brandEvidenceTitle = cleanEvidenceSnippet(brandEvidence);
  const slugTitle = getSlugTitle(row.productUrl);
  const normalizedModel = model.toLowerCase();
  const normalizedBrand = brand.toLowerCase();
  const isModelCode =
    model.length <= 14 &&
    !model.includes(" ") &&
    MODEL_CODE_REGEX.test(normalizedModel) &&
    DIGIT_REGEX.test(model);
  const isDescriptiveModel =
    model.includes(" ") ||
    normalizedModel.includes("usb") ||
    normalizedModel.includes("cable");
  const descriptiveBrandEvidence =
    brandEvidenceTitle &&
    brandEvidenceTitle.toLowerCase() !== normalizedBrand &&
    (brandEvidenceTitle.toLowerCase().includes("usb") ||
      brandEvidenceTitle.toLowerCase().includes("cable"))
      ? brandEvidenceTitle
      : undefined;

  const titleCandidates = [
    modelEvidenceTitle &&
    !MODEL_CODE_REGEX.test(modelEvidenceTitle.toLowerCase())
      ? modelEvidenceTitle
      : undefined,
    descriptiveBrandEvidence,
    slugTitle,
    model && model.toLowerCase() !== brand.toLowerCase() && isDescriptiveModel
      ? model
      : undefined,
    modelEvidenceTitle,
    !isModelCode && model.toLowerCase() !== normalizedBrand ? model : undefined,
  ].filter(Boolean);

  return titleCandidates[0] ?? `${brand} cable`;
};

export const mapCatalogRowToProfile = (row: CatalogCableRow): CableProfile => {
  const connectorFrom = normalizeConnector(row.connectorFrom);
  const connectorTo = normalizeConnector(row.connectorTo);
  const normalizedData = clampDataCapabilityByConnector(
    {
      ...row.data,
      maxGbps:
        row.data.maxGbps ?? inferMaxGbpsFromGeneration(row.data.usbGeneration),
    },
    connectorFrom,
    connectorTo
  );

  return {
    source: "catalog",
    variantId: row.variantId,
    brand: row.brand,
    model: row.model,
    displayName: getDisplayName(row),
    variant: row.variant,
    sku: row.sku,
    productUrl: row.productUrl,
    imageUrls: row.imageUrls,
    evidenceRefs: row.evidenceRefs,
    connectorFrom,
    connectorTo,
    power: row.power,
    data: normalizedData,
    video: row.video,
  };
};

export const buildProfileFromMarkings = (
  draft: MarkingsDraft
): CableProfile => {
  const maxWatts = draft.dataOnly ? 0 : parsePositiveNumber(draft.watts);
  const parsedGbps = parsePositiveNumber(draft.gbps);
  const parsedRefreshHz = parsePositiveNumber(draft.maxRefreshHz);
  const connectorFrom = normalizeConnector(draft.connectorFrom);
  const connectorTo = normalizeConnector(draft.connectorTo);
  const normalizedData = clampDataCapabilityByConnector(
    {
      usbGeneration: draft.usbGeneration.trim() || undefined,
      maxGbps: parsedGbps ?? inferMaxGbpsFromGeneration(draft.usbGeneration),
    },
    connectorFrom,
    connectorTo
  );

  return {
    source: "markings",
    connectorFrom,
    connectorTo,
    power: {
      maxWatts,
      pdSupported: draft.watts.toLowerCase().includes("pd"),
    },
    data: normalizedData,
    video: {
      explicitlySupported:
        draft.videoSupport === "unknown"
          ? undefined
          : draft.videoSupport === "yes",
      maxResolution: draft.maxResolution.trim() || undefined,
      maxRefreshHz: parsedRefreshHz,
    },
  };
};

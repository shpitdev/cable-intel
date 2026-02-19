export type CatalogQualityState = "ready" | "needs_enrichment";

export interface CatalogQualityAssessment {
  issues: string[];
  state: CatalogQualityState;
}

interface CatalogQualityInput {
  brand?: string;
  connectorFrom?: string;
  connectorTo?: string;
  evidenceRefs: readonly {
    fieldPath: string;
  }[];
  imageUrls: readonly string[];
  model?: string;
  power: {
    maxWatts?: number;
  };
  productUrl?: string;
}

const UNKNOWN_TOKENS = new Set(["", "unknown", "n/a", "na", "none", "null"]);

const CRITICAL_FIELD_PATHS = [
  "brand",
  "model",
  "connectorPair.from",
  "connectorPair.to",
] as const;

const normalizeToken = (value?: string): string => {
  return value?.trim().toLowerCase() ?? "";
};

const hasMeaningfulValue = (value?: string): boolean => {
  return !UNKNOWN_TOKENS.has(normalizeToken(value));
};

const isUsbCToUsbC = (
  connectorFrom?: string,
  connectorTo?: string
): boolean => {
  return (
    normalizeToken(connectorFrom) === "usb-c" &&
    normalizeToken(connectorTo) === "usb-c"
  );
};

export const assessCatalogQuality = (
  input: CatalogQualityInput
): CatalogQualityAssessment => {
  const issues: string[] = [];

  if (!hasMeaningfulValue(input.brand)) {
    issues.push("missing_brand");
  }

  if (!hasMeaningfulValue(input.model)) {
    issues.push("missing_model");
  }

  if (!hasMeaningfulValue(input.connectorFrom)) {
    issues.push("missing_connector_from");
  }

  if (!hasMeaningfulValue(input.connectorTo)) {
    issues.push("missing_connector_to");
  }

  if (!hasMeaningfulValue(input.productUrl)) {
    issues.push("missing_product_url");
  }

  if (input.imageUrls.length < 1) {
    issues.push("missing_images");
  }

  if (input.evidenceRefs.length < 1) {
    issues.push("missing_evidence");
  }

  const evidenceFieldPaths = new Set(
    input.evidenceRefs.map((reference) => reference.fieldPath)
  );
  const missingCriticalEvidence = CRITICAL_FIELD_PATHS.filter((fieldPath) => {
    return !evidenceFieldPaths.has(fieldPath);
  });
  if (missingCriticalEvidence.length > 0) {
    issues.push(
      `missing_critical_evidence:${missingCriticalEvidence.join(",")}`
    );
  }

  if (isUsbCToUsbC(input.connectorFrom, input.connectorTo)) {
    const maxWatts = input.power.maxWatts ?? 0;
    if (maxWatts <= 0) {
      issues.push("missing_usb_c_power");
    }
  }

  return {
    state: issues.length === 0 ? "ready" : "needs_enrichment",
    issues,
  };
};

export interface ShopifyEvidencePointer {
  fieldPath: string;
  snippet?: string;
  sourceUrl: string;
}

export interface ShopifyExtractedCableSpec {
  brand: string;
  connectorPair: {
    from: string;
    to: string;
  };
  data: {
    usbGeneration?: string;
    maxGbps?: number;
  };
  evidence: ShopifyEvidencePointer[];
  images: {
    url: string;
    alt?: string;
  }[];
  model: string;
  power: {
    maxWatts?: number;
    pdSupported?: boolean;
    eprSupported?: boolean;
  };
  sku?: string;
  variant?: string;
  video: {
    explicitlySupported?: boolean;
    maxResolution?: string;
    maxRefreshHz?: number;
  };
}

export interface ShopifySourceDocument {
  canonicalUrl: string;
  fetchedAt: number;
  html: string;
  markdown: string;
  url: string;
}

export interface ShopifyExtractionResult {
  cables: ShopifyExtractedCableSpec[];
  source: ShopifySourceDocument;
}

export interface ShopifyProductCandidate {
  handle: string;
  summaryHtml?: string;
  title: string;
}

export interface ShopifyCableSourceTemplate {
  baseUrl: string;
  id: string;
  includeCandidate: (candidate: ShopifyProductCandidate) => boolean;
  matchesProductUrl: (url: URL) => boolean;
  name: string;
  productPathPrefix: string;
  searchPath: string;
  searchQueryParam: string;
  searchQueryValue: string;
}

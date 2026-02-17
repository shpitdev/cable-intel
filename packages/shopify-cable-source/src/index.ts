import { createShopifyCableSource as createSource } from "./source";
import { shopifyCableTemplates as templateRegistry } from "./templates";
import type { ShopifyCableSourceTemplate } from "./types";

export type {
  ShopifyCableSourceTemplate,
  ShopifyEvidencePointer,
  ShopifyExtractedCableSpec,
  ShopifyExtractionResult,
  ShopifyProductCandidate,
  ShopifySourceDocument,
} from "./types";

export const createShopifyCableSource = createSource;
export const shopifyCableTemplates = templateRegistry;

export const listShopifyCableTemplates = (): ShopifyCableSourceTemplate[] => {
  return [...templateRegistry];
};

export const getShopifyCableTemplateById = (
  templateId: string
): ShopifyCableSourceTemplate | null => {
  for (const template of templateRegistry) {
    if (template.id === templateId) {
      return template;
    }
  }
  return null;
};

export const matchShopifyTemplateForUrl = (
  urlString: string
): ShopifyCableSourceTemplate | null => {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return null;
  }

  for (const template of templateRegistry) {
    if (template.matchesProductUrl(url)) {
      return template;
    }
  }

  return null;
};

export const discoverShopifyTemplateUrls = async (
  templateId: string,
  maxItems?: number
): Promise<string[]> => {
  const template = getShopifyCableTemplateById(templateId);
  if (!template) {
    throw new Error(`Unknown Shopify cable template: ${templateId}`);
  }

  const source = createSource(template);
  return await source.discoverProductUrls(maxItems);
};

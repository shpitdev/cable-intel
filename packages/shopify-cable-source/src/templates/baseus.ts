import type {
  ShopifyCableSourceTemplate,
  ShopifyProductCandidate,
} from "../types";

const ACCESSORY_TITLE_REGEX =
  /power\s*bank|charger|charging\s*station|docking\s*station|hub|adapter|dock|screen\s*protector/;
const BUILT_IN_CABLE_REGEX = /built-?in\s*cable/;

const isLikelyCableProduct = ({
  handle,
  title,
}: ShopifyProductCandidate): boolean => {
  const normalizedTitle = title.toLowerCase();
  const normalizedHandle = handle.toLowerCase();

  if (!normalizedTitle.includes("cable")) {
    return false;
  }

  if (normalizedHandle.startsWith("bundle-")) {
    return false;
  }

  if (ACCESSORY_TITLE_REGEX.test(normalizedTitle)) {
    return false;
  }

  if (BUILT_IN_CABLE_REGEX.test(normalizedTitle)) {
    return false;
  }

  return true;
};

export const baseusShopifyTemplate: ShopifyCableSourceTemplate = {
  id: "baseus",
  name: "Baseus",
  baseUrl: "https://www.baseus.com",
  searchPath: "/search",
  searchQueryParam: "q",
  searchQueryValue: "cable",
  productPathPrefix: "/products/",
  matchesProductUrl: (url: URL) => {
    if (!(url.hostname === "www.baseus.com" || url.hostname === "baseus.com")) {
      return false;
    }
    return url.pathname.toLowerCase().includes("/products/");
  },
  includeCandidate: isLikelyCableProduct,
};

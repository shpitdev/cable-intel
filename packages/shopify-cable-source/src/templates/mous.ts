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

export const mousShopifyTemplate: ShopifyCableSourceTemplate = {
  id: "mous",
  name: "Mous",
  baseUrl: "https://www.mous.co",
  searchPath: "/search",
  searchQueryParam: "q",
  searchQueryValue: "cable",
  productPathPrefix: "/products/",
  matchesProductUrl: (url: URL) => {
    if (!(url.hostname === "www.mous.co" || url.hostname === "mous.co")) {
      return false;
    }
    return url.pathname.toLowerCase().includes("/products/");
  },
  includeCandidate: isLikelyCableProduct,
};

import { ankerShopifyTemplate } from "./anker";
import { baseusShopifyTemplate } from "./baseus";
import { mousShopifyTemplate } from "./mous";
import { nativeUnionShopifyTemplate } from "./native-union";
import { satechiShopifyTemplate } from "./satechi";
import { ugreenShopifyTemplate } from "./ugreen";

export const shopifyCableTemplates = [
  ankerShopifyTemplate,
  nativeUnionShopifyTemplate,
  satechiShopifyTemplate,
  mousShopifyTemplate,
  baseusShopifyTemplate,
  ugreenShopifyTemplate,
] as const;

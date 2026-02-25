import { describe, expect, it } from "bun:test";
import { createShopifyCableSource } from "./source";
import { shopifyCableTemplates } from "./templates";

const ANKER_TEMPLATE_ID = "anker-us";
const NATIVE_UNION_TEMPLATE_ID = "native-union";
const SATECHI_TEMPLATE_ID = "satechi";
const MOUS_TEMPLATE_ID = "mous";
const BASEUS_TEMPLATE_ID = "baseus";
const UGREEN_TEMPLATE_ID = "ugreen";
const LIGHTNING_MAX_GBPS = 0.48 as const;
const LIGHTNING_USB_GENERATION_FRAGMENT = "USB 2.0" as const;
const EXPECTED_BRAND = "Anker";
const ankerTemplate = shopifyCableTemplates.find((template) => {
  return template.id === ANKER_TEMPLATE_ID;
});

if (!ankerTemplate) {
  throw new Error("Missing Anker Shopify template");
}

const nativeUnionTemplate = shopifyCableTemplates.find((template) => {
  return template.id === NATIVE_UNION_TEMPLATE_ID;
});

if (!nativeUnionTemplate) {
  throw new Error("Missing Native Union Shopify template");
}

const satechiTemplate = shopifyCableTemplates.find((template) => {
  return template.id === SATECHI_TEMPLATE_ID;
});

if (!satechiTemplate) {
  throw new Error("Missing Satechi Shopify template");
}

const mousTemplate = shopifyCableTemplates.find((template) => {
  return template.id === MOUS_TEMPLATE_ID;
});

if (!mousTemplate) {
  throw new Error("Missing Mous Shopify template");
}

const baseusTemplate = shopifyCableTemplates.find((template) => {
  return template.id === BASEUS_TEMPLATE_ID;
});

if (!baseusTemplate) {
  throw new Error("Missing Baseus Shopify template");
}

const ugreenTemplate = shopifyCableTemplates.find((template) => {
  return template.id === UGREEN_TEMPLATE_ID;
});

if (!ugreenTemplate) {
  throw new Error("Missing UGREEN Shopify template");
}

const discoverAnkerProductUrls = async (limit: number): Promise<string[]> => {
  const source = createShopifyCableSource(ankerTemplate);
  return await source.discoverProductUrls(limit);
};

const extractAnkerProduct = async (url: string) => {
  const source = createShopifyCableSource(ankerTemplate);
  const result = await source.extractFromProductUrl(url);
  if (!result) {
    throw new Error(`Expected Anker extraction result for ${url}`);
  }
  return result;
};

describe("shopify cable source integration", () => {
  it("discovers Anker cable product URLs from Shopify/Next data", async () => {
    const urls = await discoverAnkerProductUrls(80);

    expect(urls.length).toBeGreaterThan(10);
    expect(
      urls.some((url) =>
        url.includes("/products/a82e2-240w-usb-c-to-usb-c-cable")
      )
    ).toBe(true);
    expect(urls.some((url) => url.includes("/products/a80e6"))).toBe(true);
    expect(urls.some((url) => url.includes("/products/a8552"))).toBe(true);
  }, 120_000);

  it("extracts full variant cable specs from a single Shopify product URL", async () => {
    const result = await extractAnkerProduct(
      "https://www.anker.com/products/a82e2-240w-usb-c-to-usb-c-cable"
    );

    expect(result.source.url).toBe(
      "https://www.anker.com/products/a82e2-240w-usb-c-to-usb-c-cable"
    );
    expect(result.source.markdown.length).toBeGreaterThan(200);
    expect(result.source.html.length).toBeGreaterThan(20);

    expect(result.cables.length).toBeGreaterThan(4);

    const skus = new Set<string>();
    let has240w = false;

    for (const cable of result.cables) {
      expect(cable.brand.length).toBeGreaterThan(0);
      expect(cable.model.length).toBeGreaterThan(0);
      expect(cable.connectorPair.from.length).toBeGreaterThan(0);
      expect(cable.connectorPair.to.length).toBeGreaterThan(0);
      expect(cable.images.length).toBeGreaterThan(0);

      const fieldPaths = new Set(cable.evidence.map((item) => item.fieldPath));
      expect(fieldPaths.has("brand")).toBe(true);
      expect(fieldPaths.has("model")).toBe(true);
      expect(fieldPaths.has("connectorPair.from")).toBe(true);
      expect(fieldPaths.has("connectorPair.to")).toBe(true);

      if (cable.sku) {
        skus.add(cable.sku);
      }

      if (cable.power.maxWatts === 240) {
        has240w = true;
      }
    }

    expect(skus.size).toBeGreaterThan(4);
    expect(skus.has("A82E2011")).toBe(true);
    expect(has240w).toBe(true);
  }, 120_000);

  it("does not classify Lightning cables as Thunderbolt/USB4 class", async () => {
    const result = await extractAnkerProduct(
      "https://www.anker.com/products/a8633"
    );

    expect(result.cables.length).toBeGreaterThan(0);
    for (const cable of result.cables) {
      expect(
        cable.connectorPair.from === "Lightning" ||
          cable.connectorPair.to === "Lightning"
      ).toBe(true);
      expect(cable.data.maxGbps).toBeLessThanOrEqual(LIGHTNING_MAX_GBPS);
      expect(cable.data.usbGeneration).toContain(
        LIGHTNING_USB_GENERATION_FRAGMENT
      );
    }
  }, 120_000);

  it("normalizes beta-like vendor aliases to the canonical template brand", async () => {
    const result = await extractAnkerProduct(
      "https://www.anker.com/products/a84n1"
    );

    expect(result.cables.length).toBeGreaterThan(0);
    for (const cable of result.cables) {
      expect(cable.brand).toBe(EXPECTED_BRAND);
    }
  }, 120_000);

  it("prefers explicit per-variant wattage labels over page-level defaults", async () => {
    const result = await extractAnkerProduct(
      "https://www.anker.com/products/a8552"
    );

    const variantsWith240Label = result.cables.filter((cable) => {
      return cable.variant?.toLowerCase().includes("240w");
    });
    expect(variantsWith240Label.length).toBeGreaterThan(0);
    for (const cable of variantsWith240Label) {
      expect(cable.power.maxWatts).toBe(240);
    }
  }, 120_000);

  it("uses model hints before SKU when a single variant is 'Default Title'", async () => {
    const result = await extractAnkerProduct(
      "https://www.anker.com/products/b81a2"
    );

    expect(result.cables.length).toBeGreaterThan(0);
    for (const cable of result.cables) {
      expect(cable.sku?.length ?? 0).toBeGreaterThan(0);
      expect(cable.variant?.length ?? 0).toBeGreaterThan(0);
      expect(cable.variant?.toLowerCase()).not.toBe("default title");
    }
  }, 120_000);

  it("does not emit optional evidence refs without snippets", async () => {
    const result = await extractAnkerProduct(
      "https://www.anker.com/products/a8662"
    );

    expect(result.cables.length).toBeGreaterThan(0);
    for (const cable of result.cables) {
      for (const evidence of cable.evidence) {
        expect(evidence.snippet?.trim().length ?? 0).toBeGreaterThan(0);
      }
    }
  }, 120_000);

  it("prefixes model titles with brand when storefront title omits it", async () => {
    const result = await extractAnkerProduct(
      "https://www.anker.com/products/a8758"
    );

    expect(result.cables.length).toBeGreaterThan(0);
    for (const cable of result.cables) {
      expect(cable.model.toLowerCase().includes("anker")).toBe(true);
    }
  }, 120_000);

  it("derives 240W power for all Anker A80E6 USB-C variants", async () => {
    const result = await extractAnkerProduct(
      "https://www.anker.com/products/a80e6"
    );

    expect(result.cables.length).toBe(7);
    for (const cable of result.cables) {
      expect(cable.connectorPair.from).toBe("USB-C");
      expect(cable.connectorPair.to).toBe("USB-C");
      expect(cable.power.maxWatts).toBe(240);
      expect(
        cable.evidence.some((item) => item.fieldPath === "power.maxWatts")
      ).toBe(true);
    }
  }, 120_000);

  it("extracts cable variants for additional Shopify cable brands", async () => {
    const cases = [
      {
        minVariants: 2,
        template: nativeUnionTemplate,
        url: "https://www.nativeunion.com/products/belt-cable-2-in-1-usb-c-to-usb-c-usb-c-cable-140w",
      },
      {
        minVariants: 1,
        template: satechiTemplate,
        url: "https://satechi.com/products/thunderbolt-5-pro-cable",
      },
      {
        minVariants: 2,
        template: mousTemplate,
        url: "https://www.mous.co/products/usb-c-to-usb-c-charging-cable",
      },
      {
        minVariants: 3,
        template: baseusTemplate,
        url: "https://www.baseus.com/products/usb-c-to-usb-c-cable-100w",
      },
      {
        minVariants: 1,
        template: ugreenTemplate,
        url: "https://www.ugreen.com/products/usa-90440",
      },
    ];

    for (const entry of cases) {
      const source = createShopifyCableSource(entry.template);
      const result = await source.extractFromProductUrl(entry.url);

      expect(result).not.toBeNull();
      if (!result) {
        throw new Error(`Expected extraction result for ${entry.url}`);
      }

      expect(result.cables.length).toBeGreaterThanOrEqual(entry.minVariants);
      for (const cable of result.cables) {
        expect(cable.brand.length).toBeGreaterThan(0);
        expect(cable.brand.toLowerCase()).not.toBe("n/a");
        expect(cable.model.length).toBeGreaterThan(0);
        expect(cable.connectorPair.from.length).toBeGreaterThan(0);
        expect(cable.connectorPair.to.length).toBeGreaterThan(0);
        expect(cable.images.length).toBeGreaterThan(0);
        expect(cable.evidence.some((item) => item.fieldPath === "brand")).toBe(
          true
        );
        expect(cable.evidence.some((item) => item.fieldPath === "model")).toBe(
          true
        );
      }
    }
  }, 120_000);

  it("recovers wattage from Shopify suggest metadata when product payload is sparse", async () => {
    const source = createShopifyCableSource(nativeUnionTemplate);
    const result = await source.extractFromProductUrl(
      "https://www.nativeunion.com/products/belt-cable-duo"
    );

    expect(result).not.toBeNull();
    if (!result) {
      throw new Error(
        "Expected extraction result for Native Union belt-cable-duo"
      );
    }

    expect(result.cables.length).toBeGreaterThan(0);
    for (const cable of result.cables) {
      expect(cable.power.maxWatts).toBe(60);
      expect(
        cable.evidence.some((item) => item.fieldPath === "power.maxWatts")
      ).toBe(true);
    }
  }, 120_000);
});

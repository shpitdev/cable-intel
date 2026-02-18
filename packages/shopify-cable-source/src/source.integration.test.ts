import { describe, expect, it } from "bun:test";
import { createShopifyCableSource } from "./source";
import { shopifyCableTemplates } from "./templates";

const ANKER_TEMPLATE_ID = "anker-us";
const LIGHTNING_MAX_GBPS = 0.48 as const;
const LIGHTNING_USB_GENERATION_FRAGMENT = "USB 2.0" as const;
const EXPECTED_BRAND = "Anker";
const ankerTemplate = shopifyCableTemplates.find((template) => {
  return template.id === ANKER_TEMPLATE_ID;
});

if (!ankerTemplate) {
  throw new Error("Missing Anker Shopify template");
}

describe("shopify cable source integration", () => {
  it("discovers Anker cable product URLs from Shopify/Next data", async () => {
    const source = createShopifyCableSource(ankerTemplate);
    const urls = await source.discoverProductUrls(80);

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
    const source = createShopifyCableSource(ankerTemplate);
    const result = await source.extractFromProductUrl(
      "https://www.anker.com/products/a82e2-240w-usb-c-to-usb-c-cable"
    );

    expect(result).not.toBeNull();
    if (!result) {
      return;
    }

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
    const source = createShopifyCableSource(ankerTemplate);
    const result = await source.extractFromProductUrl(
      "https://www.anker.com/products/a8633"
    );

    expect(result).not.toBeNull();
    if (!result) {
      return;
    }

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
    const source = createShopifyCableSource(ankerTemplate);
    const result = await source.extractFromProductUrl(
      "https://www.anker.com/products/a84n1"
    );

    expect(result).not.toBeNull();
    if (!result) {
      return;
    }

    expect(result.cables.length).toBeGreaterThan(0);
    for (const cable of result.cables) {
      expect(cable.brand).toBe(EXPECTED_BRAND);
    }
  }, 120_000);

  it("prefers explicit per-variant wattage labels over page-level defaults", async () => {
    const source = createShopifyCableSource(ankerTemplate);
    const result = await source.extractFromProductUrl(
      "https://www.anker.com/products/a8552"
    );

    expect(result).not.toBeNull();
    if (!result) {
      return;
    }

    const variantsWith240Label = result.cables.filter((cable) => {
      return cable.variant?.toLowerCase().includes("240w");
    });
    expect(variantsWith240Label.length).toBeGreaterThan(0);
    for (const cable of variantsWith240Label) {
      expect(cable.power.maxWatts).toBe(240);
    }
  }, 120_000);

  it("falls back to SKU when a single Shopify variant is 'Default Title'", async () => {
    const source = createShopifyCableSource(ankerTemplate);
    const result = await source.extractFromProductUrl(
      "https://www.anker.com/products/b81a2"
    );

    expect(result).not.toBeNull();
    if (!result) {
      return;
    }

    expect(result.cables.length).toBeGreaterThan(0);
    for (const cable of result.cables) {
      expect(cable.sku?.length ?? 0).toBeGreaterThan(0);
      expect(cable.variant).toBe(cable.sku);
    }
  }, 120_000);

  it("does not emit optional evidence refs without snippets", async () => {
    const source = createShopifyCableSource(ankerTemplate);
    const result = await source.extractFromProductUrl(
      "https://www.anker.com/products/a8662"
    );

    expect(result).not.toBeNull();
    if (!result) {
      return;
    }

    expect(result.cables.length).toBeGreaterThan(0);
    for (const cable of result.cables) {
      for (const evidence of cable.evidence) {
        expect(evidence.snippet?.trim().length ?? 0).toBeGreaterThan(0);
      }
    }
  }, 120_000);
});

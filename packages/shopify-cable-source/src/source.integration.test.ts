import { describe, expect, it } from "bun:test";
import { createShopifyCableSource } from "./source";
import { shopifyCableTemplates } from "./templates";

const ANKER_TEMPLATE_ID = "anker-us";
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
      expect(cable.data.maxGbps).toBeLessThanOrEqual(0.48);
      expect(cable.data.usbGeneration).toContain("USB 2.0");
    }
  }, 120_000);
});

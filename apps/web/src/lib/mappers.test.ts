import { describe, expect, it } from "bun:test";
import { buildProfileFromMarkings, mapCatalogRowToProfile } from "$lib/mappers";
import type { CatalogCableRow, MarkingsDraft } from "$lib/types";

describe("mapCatalogRowToProfile", () => {
  it("maps Convex row shape into a normalized cable profile", () => {
    const row: CatalogCableRow = {
      variantId: "variant_1",
      brand: "Anker",
      model: "A82E2",
      variant: "3ft",
      sku: "A82E2011",
      connectorFrom: "USB-C",
      connectorTo: "USB-C",
      productUrl: "https://example.com",
      imageUrls: ["https://example.com/image.jpg"],
      evidenceRefs: [
        {
          fieldPath: "model",
          snippet: "Anker USB-C to USB-C Cable (240W)",
        },
      ],
      power: { maxWatts: 240, eprSupported: true },
      data: { usbGeneration: "USB 2.0" },
      video: { explicitlySupported: false },
    };

    const profile = mapCatalogRowToProfile(row);

    expect(profile.source).toBe("catalog");
    expect(profile.variantId).toBe("variant_1");
    expect(profile.connectorFrom).toBe("USB-C");
    expect(profile.power.maxWatts).toBe(240);
    expect(profile.imageUrls?.[0]).toBe("https://example.com/image.jpg");
    expect(profile.productUrl).toBe("https://example.com");
    expect(profile.sku).toBe("A82E2011");
    expect(profile.displayName).toBe("Anker USB-C to USB-C Cable (240W)");
    expect(profile.evidenceRefs?.[0]?.fieldPath).toBe("model");
  });

  it("prefers descriptive evidence title over model-number snippets", () => {
    const row: CatalogCableRow = {
      variantId: "variant_2",
      brand: "Anker",
      model: "A82G2",
      variant: "2 Pack",
      sku: "BUNDLE-A82G2021-2",
      connectorFrom: "USB-A",
      connectorTo: "USB-C",
      productUrl: "https://www.anker.com/products/bundle-a82g2021-1-a82g2022-1",
      imageUrls: [],
      evidenceRefs: [
        {
          fieldPath: "model",
          snippet: "Model Number: A82G2",
        },
        {
          fieldPath: "brand",
          snippet:
            "Anker USB-A to USB-C Cable (3 ft, Upcycled-Braided, 2 Pack)",
        },
      ],
      power: {},
      data: {},
      video: {},
    };

    const profile = mapCatalogRowToProfile(row);

    expect(profile.displayName).toContain("USB-A to USB-C Cable");
    expect(profile.displayName).not.toBe("A82G2");
  });

  it("clamps Lightning connector pairs to USB 2.0 data class", () => {
    const row: CatalogCableRow = {
      variantId: "variant_lightning",
      brand: "Anker",
      model: "A8633",
      variant: "6 ft",
      sku: "A8633011",
      connectorFrom: "USB-C",
      connectorTo: "Lightning",
      productUrl: "https://www.anker.com/products/a8633",
      imageUrls: [],
      evidenceRefs: [],
      power: { maxWatts: 87 },
      data: { usbGeneration: "Thunderbolt 3", maxGbps: 40 },
      video: {},
    };

    const profile = mapCatalogRowToProfile(row);

    expect(profile.data.maxGbps).toBe(0.48);
    expect(profile.data.usbGeneration).toContain("USB 2.0");
  });
});

describe("buildProfileFromMarkings", () => {
  it("builds a markings profile and parses numeric fields", () => {
    const draft: MarkingsDraft = {
      connectorFrom: "USB-C",
      connectorTo: "USB-C",
      watts: "100",
      usbGeneration: "USB 3.2 Gen 2",
      gbps: "10",
      videoSupport: "yes",
      maxResolution: "4K",
      maxRefreshHz: "60",
      dataOnly: false,
    };

    const profile = buildProfileFromMarkings(draft);

    expect(profile.source).toBe("markings");
    expect(profile.power.maxWatts).toBe(100);
    expect(profile.data.maxGbps).toBe(10);
    expect(profile.video.explicitlySupported).toBe(true);
    expect(profile.video.maxRefreshHz).toBe(60);
  });
});

import { describe, expect, it } from "bun:test";
import { assessCatalogQuality } from "./catalogQuality";

const baseEvidenceRefs = [
  { fieldPath: "brand" },
  { fieldPath: "model" },
  { fieldPath: "connectorPair.from" },
  { fieldPath: "connectorPair.to" },
];

describe("assessCatalogQuality", () => {
  it("marks complete USB-C rows as ready", () => {
    const assessment = assessCatalogQuality({
      brand: "Anker",
      model: "Anker Prime USB-C Cable",
      connectorFrom: "USB-C",
      connectorTo: "USB-C",
      productUrl: "https://www.anker.com/products/example",
      imageUrls: ["https://images.example.com/cable.jpg"],
      power: { maxWatts: 100 },
      evidenceRefs: baseEvidenceRefs,
    });

    expect(assessment.state).toBe("ready");
    expect(assessment.issues).toEqual([]);
  });

  it("marks incomplete rows as needs_enrichment", () => {
    const assessment = assessCatalogQuality({
      brand: "Unknown",
      model: "Cable",
      connectorFrom: "USB-C",
      connectorTo: "USB-C",
      imageUrls: [],
      power: {},
      evidenceRefs: [{ fieldPath: "model" }],
    });

    expect(assessment.state).toBe("needs_enrichment");
    expect(assessment.issues).toContain("missing_brand");
    expect(assessment.issues).toContain("missing_product_url");
    expect(assessment.issues).toContain("missing_images");
    expect(assessment.issues).toContain("missing_usb_c_power");
  });
});

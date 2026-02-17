import { describe, expect, it } from "bun:test";
import { parseExtractionOutput } from "./extraction";

const validExtractionOutput = {
  brand: "Anker",
  model: "765",
  connectorPair: {
    from: "USB-C",
    to: "USB-C",
  },
  power: {
    maxWatts: 140,
    pdSupported: true,
    eprSupported: true,
  },
  data: {
    usbGeneration: "USB 3.2 Gen 2",
    maxGbps: 10,
  },
  video: {
    explicitlySupported: true,
    maxResolution: "4K",
    maxRefreshHz: 60,
  },
  images: [
    {
      url: "https://example.com/cable.jpg",
      alt: "Cable hero image",
    },
  ],
  evidence: [
    {
      fieldPath: "brand",
      sourceUrl: "https://example.com/cable",
    },
    {
      fieldPath: "model",
      sourceUrl: "https://example.com/cable",
    },
    {
      fieldPath: "connectorPair.from",
      sourceUrl: "https://example.com/cable",
    },
    {
      fieldPath: "connectorPair.to",
      sourceUrl: "https://example.com/cable",
    },
  ],
};

describe("parseExtractionOutput", () => {
  it("accepts valid extraction output", () => {
    expect(parseExtractionOutput(validExtractionOutput)).toEqual(
      validExtractionOutput
    );
  });

  it("rejects output missing critical evidence", () => {
    const invalidOutput = {
      ...validExtractionOutput,
      evidence: validExtractionOutput.evidence.filter(
        (item) => item.fieldPath !== "brand"
      ),
    };

    expect(() => parseExtractionOutput(invalidOutput)).toThrow(
      "Missing evidence for critical fields: brand"
    );
  });
});

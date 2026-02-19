import { describe, expect, it } from "bun:test";
import { parseExtractionOutput } from "./contracts/extraction";
import {
  applyShopifyJsonLlmEnrichment,
  applyShopifyJsonPowerSignals,
  buildShopifyJsonEnrichmentInput,
  deriveDeterministicPowerSignals,
  shouldAttemptShopifyJsonEnrichment,
} from "./shopifyJsonEnrichment";

const SOURCE_URL = "https://example.com/products/usb4-cable";

const baseParsedCable = () => {
  return parseExtractionOutput({
    brand: "Example",
    connectorPair: {
      from: "USB-C",
      to: "USB-C",
    },
    data: {},
    evidence: [
      {
        fieldPath: "brand",
        snippet: "Example",
        sourceUrl: SOURCE_URL,
      },
      {
        fieldPath: "model",
        snippet: "Example USB4 C-to-C Cable",
        sourceUrl: SOURCE_URL,
      },
      {
        fieldPath: "connectorPair.from",
        snippet: "USB-C to USB-C",
        sourceUrl: SOURCE_URL,
      },
      {
        fieldPath: "connectorPair.to",
        snippet: "USB-C to USB-C",
        sourceUrl: SOURCE_URL,
      },
    ],
    images: [{ url: "https://cdn.example.com/cable.jpg" }],
    model: "Example USB4 C-to-C Cable",
    power: {},
    video: {},
  });
};

describe("shopifyJsonEnrichment", () => {
  it("derives deterministic watts from stable Shopify JSON fields", () => {
    const input = buildShopifyJsonEnrichmentInput(
      {
        description:
          "Next-gen USB4 cable with Thunderbolt compatibility and fast charging.",
        options: [{ name: "Length", values: ["10in", "2.6ft"] }],
        tags: ["100w", "usb4", "thunderbolt4"],
        title: "USB4 C-to-C Cable",
        variants: [
          {
            option1: "2.6ft",
            sku: "ST-U4C80M",
            title: "2.6ft",
          },
        ],
        vendor: "Satechi",
      },
      {
        sku: "ST-U4C80M",
      }
    );

    expect(input).not.toBeNull();
    if (!input) {
      return;
    }

    const signals = deriveDeterministicPowerSignals(input);
    expect(signals.maxWatts).toBe(100);
    expect(signals.snippet).toContain("100w");
  });

  it("applies deterministic power evidence when watts are missing", () => {
    const parsed = baseParsedCable();
    const next = applyShopifyJsonPowerSignals(parsed, SOURCE_URL, {
      maxWatts: 100,
      snippet: "100W tag",
    });

    expect(next.power.maxWatts).toBe(100);
    expect(
      next.evidence.some((reference) => {
        return (
          reference.fieldPath === "power.maxWatts" &&
          (reference.snippet ?? "").includes("100W")
        );
      })
    ).toBe(true);
  });

  it("rejects llm wattage when value is not explicitly present in Shopify JSON text", () => {
    const parsed = baseParsedCable();
    const next = applyShopifyJsonLlmEnrichment(
      parsed,
      SOURCE_URL,
      {
        evidence: [
          {
            fieldPath: "power.maxWatts",
            snippet: "Likely fast charging",
          },
        ],
        power: {
          maxWatts: 140,
        },
      },
      JSON.stringify({ title: "USB-C cable", tags: ["fast charging"] })
    );

    expect(next.power.maxWatts).toBeUndefined();
    expect(
      next.evidence.some((reference) => {
        return reference.fieldPath === "power.maxWatts";
      })
    ).toBe(false);
  });

  it("only attempts enrichment for usb-c to usb-c rows missing watts", () => {
    const missingWatts = baseParsedCable();
    expect(shouldAttemptShopifyJsonEnrichment(missingWatts)).toBe(true);

    const ready = parseExtractionOutput({
      ...missingWatts,
      power: {
        maxWatts: 100,
      },
    });
    expect(shouldAttemptShopifyJsonEnrichment(ready)).toBe(false);
  });
});

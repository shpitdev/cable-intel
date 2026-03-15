import { describe, expect, it } from "bun:test";
import {
  collectNormalizedConnectors,
  extractConnectorPairFromText,
} from "./connector-text";

describe("extractConnectorPairFromText", () => {
  it("parses USB-C to USB-C titles without regex backtracking", () => {
    expect(extractConnectorPairFromText("USB-C to USB-C Cable")).toEqual({
      from: "USB-C",
      matchedText: "usb c to usb c",
      to: "USB-C",
    });
  });

  it("normalizes Thunderbolt connectors to USB-C physical endpoints", () => {
    expect(
      extractConnectorPairFromText("Thunderbolt 5 to USB-C Pro Cable")
    ).toEqual({
      from: "USB-C",
      matchedText: "thunderbolt 5 to usb c",
      to: "USB-C",
    });
  });
});

describe("collectNormalizedConnectors", () => {
  it("deduplicates normalized connectors from free text", () => {
    expect(
      collectNormalizedConnectors(
        "Works with USB-C, Thunderbolt 4, and Lightning accessories."
      )
    ).toEqual(["USB-C", "Lightning"]);
  });
});

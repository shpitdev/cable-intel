import { describe, expect, it } from "bun:test";
import { recommendLabels } from "$lib/labeling";
import type { CableProfile } from "$lib/types";

const baseProfile: CableProfile = {
  source: "markings",
  connectorFrom: "USB-C",
  connectorTo: "USB-C",
  power: {},
  data: {},
  video: {},
};

describe("recommendLabels", () => {
  it("assigns Red adapter for 240W cables", () => {
    const result = recommendLabels({
      ...baseProfile,
      power: { maxWatts: 240 },
    });

    expect(result.adapterColor).toBe("Red");
  });

  it("assigns Orange adapter for 100W-140W cables", () => {
    const result = recommendLabels({
      ...baseProfile,
      power: { maxWatts: 100 },
    });

    expect(result.adapterColor).toBe("Orange");
  });

  it("assigns Green adapter for 60W cables", () => {
    const result = recommendLabels({
      ...baseProfile,
      power: { maxWatts: 60 },
    });

    expect(result.adapterColor).toBe("Green");
  });

  it("defaults adapter to Black when power is unknown", () => {
    const result = recommendLabels(baseProfile);

    expect(result.adapterColor).toBe("Black");
  });

  it("assigns Orange velcro for USB4/TB class", () => {
    const result = recommendLabels({
      ...baseProfile,
      data: { usbGeneration: "USB4" },
    });

    expect(result.velcroColor).toBe("Orange");
  });

  it("assigns Blue velcro for 10Gbps class", () => {
    const result = recommendLabels({
      ...baseProfile,
      data: { maxGbps: 10 },
    });

    expect(result.velcroColor).toBe("Blue");
  });

  it("defaults velcro to Black when data capability is unknown", () => {
    const result = recommendLabels(baseProfile);

    expect(result.velcroColor).toBe("Black");
  });
});

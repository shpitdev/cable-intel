import { describe, expect, it, spyOn } from "bun:test";
import fixture from "./fixtures/anker-a80e7.json";
import b8173 from "./fixtures/anker-b8173.json";
import { createShopifyCableSource } from "./source";
import { ankerShopifyTemplate } from "./templates/anker";

const extractFixture = async (
  product: typeof fixture.product | typeof b8173.product,
  sourceUrl = fixture.sourceUrl
) => {
  const requestedPaths: string[] = [];
  const request = spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    requestedPaths.push(url.pathname);
    if (url.origin !== ankerShopifyTemplate.baseUrl) {
      throw new Error(`Unexpected fixture origin: ${url.origin}`);
    }
    if (url.pathname === "/search") {
      return Promise.resolve(
        new Response(
          '<script id="__NEXT_DATA__" type="application/json">{"buildId":"fixture"}</script>'
        )
      );
    }
    if (
      url.pathname === `/_next/data/fixture/products/${product.handle}.json`
    ) {
      return Promise.resolve(Response.json({ pageProps: { product } }));
    }
    // The Anker suggest endpoint returned 404 at fixture capture time.
    if (
      url.pathname === "/search/suggest.json" &&
      url.searchParams.get("q") === product.handle
    ) {
      return Promise.resolve(new Response(null, { status: 404 }));
    }
    throw new Error(`Unexpected fixture request: ${url}`);
  });
  try {
    const result =
      await createShopifyCableSource(
        ankerShopifyTemplate
      ).extractFromProductUrl(sourceUrl);
    return { result, requestedPaths };
  } finally {
    request.mockRestore();
  }
};

describe("Shopify source payload regression", () => {
  it("keeps title-derived 240W, source identity and the original variant label", async () => {
    const { result, requestedPaths } = await extractFixture(fixture.product);
    expect(requestedPaths).toEqual([
      "/search",
      "/_next/data/fixture/products/a80e7.json",
      "/search/suggest.json",
    ]);
    expect(result?.source.url).toBe(fixture.sourceUrl);
    expect(result?.source.fetchedAt).toBeGreaterThan(0);
    expect(result?.cables).toHaveLength(1);
    const cable = result?.cables[0];
    expect(cable?.sku).toBe("A80E7011");
    expect(cable?.variant).toBe("Black / 10ft");
    expect(cable?.connectorPair).toEqual({ from: "USB-C", to: "USB-C" });
    expect(cable?.power.maxWatts).toBe(240);
    expect(cable?.evidence).toContainEqual({
      fieldPath: "power.maxWatts",
      sourceUrl: fixture.sourceUrl,
      snippet: expect.stringContaining("240W"),
    });
  });

  // Synthetic edge cases derived from the captured single-variant product.
  // B81A2 no longer serves a product; do not depend on that retired URL to
  // exercise Shopify's default-title shape or pretend this is current A80E7 data.
  it.each([
    "Default Title",
    "",
  ])("uses the model hint before SKU for variant name %j", async (name) => {
    const product = structuredClone(fixture.product);
    product.variants[0].name = name;
    product.variants[0].options = [];
    const { result } = await extractFixture(product);
    expect(result?.cables).toHaveLength(1);
    expect(result?.cables[0]?.sku).toBe("A80E7011");
    expect(result?.cables[0]?.variant).toBe("240W, 10 ft");
  });
});

describe("B8173 capability extraction", () => {
  it("preserves explicit negative Power Delivery and its vendor evidence", async () => {
    const { result } = await extractFixture(b8173.product, b8173.sourceUrl);
    expect(result?.cables.map((cable) => cable.sku)).toEqual([
      "B8173011",
      "B8173041",
    ]);
    for (const cable of result?.cables ?? []) {
      expect(cable.power.pdSupported).toBe(false);
      expect(cable.power.maxWatts).toBe(15);
      expect(cable.evidence).toContainEqual({
        fieldPath: "power.pdSupported",
        sourceUrl: b8173.sourceUrl,
        snippet: expect.stringContaining("Not compatible with Power Delivery"),
      });
    }
  });

  it("converts the vendor's 480Mbps to 0.48Gbps with original unit evidence", async () => {
    const { result } = await extractFixture(b8173.product, b8173.sourceUrl);
    expect(result?.cables).toHaveLength(2);
    for (const cable of result?.cables ?? []) {
      expect(cable.data.maxGbps).toBe(0.48);
      expect(cable.evidence).toContainEqual({
        fieldPath: "data.maxGbps",
        sourceUrl: b8173.sourceUrl,
        snippet: expect.stringContaining("480Mbps"),
      });
    }
  });

  // Explicit synthetic descriptions isolate presence, negation and unknown semantics.
  it.each([
    ["Supports Power Delivery.", true],
    ["PD compatible.", true],
    ["Not compatible with Power Delivery. PD charging.", false],
    ["Does not support PD.", false],
    ["Power Delivery is not supported.", false],
    ["Durable charging cable.", undefined],
  ])("interprets PD support in %s", async (description, expected) => {
    const { result } = await extractFixture(
      { ...b8173.product, description },
      b8173.sourceUrl
    );
    expect(result?.cables).toHaveLength(2);
    expect(result?.cables[0]?.power.pdSupported).toBe(expected);
    if (expected === undefined) {
      expect(
        result?.cables[0]?.evidence.some(
          (item) => item.fieldPath === "power.pdSupported"
        )
      ).toBe(false);
    }
  });

  it("keeps evidence for the highest normalized Mbps rate", async () => {
    const description = `480Mbps. ${"Product details. ".repeat(15)}Up to 1000Mbps.`;
    const { result } = await extractFixture(
      { ...b8173.product, description },
      b8173.sourceUrl
    );
    expect(result?.cables[0]?.data.maxGbps).toBe(1);
    const evidence = result?.cables[0]?.evidence.find(
      (item) => item.fieldPath === "data.maxGbps"
    );
    expect(evidence?.snippet).toContain("1000Mbps");
    expect(evidence?.snippet).not.toContain("480Mbps");
  });

  it.each([
    ["480 Mbps", 0.48],
    ["480 mbps", 0.48],
    ["480MBps", undefined],
    ["5GBps", undefined],
    ["1000Mbps", 1],
    ["480Mbps or 1000Mbps", 1],
    ["480Mbps and 5Gbps", 5],
    ["0.48Gbps", 0.48],
    ["40 Gbps", 40],
    ["Transfer speed not listed", undefined],
  ])("normalizes data units in %s", async (description, expected) => {
    const { result } = await extractFixture(
      { ...b8173.product, description },
      b8173.sourceUrl
    );
    expect(result?.cables).toHaveLength(2);
    expect(result?.cables[0]?.data.maxGbps).toBe(expected);
  });
});

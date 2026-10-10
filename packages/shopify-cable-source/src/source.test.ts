import { describe, expect, it, spyOn } from "bun:test";
import fixture from "./fixtures/anker-a80e7.json";
import { createShopifyCableSource } from "./source";
import { ankerShopifyTemplate } from "./templates/anker";

const extractFixture = async (product: typeof fixture.product) => {
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
    if (url.pathname === "/_next/data/fixture/products/a80e7.json") {
      return Promise.resolve(Response.json({ pageProps: { product } }));
    }
    // The Anker suggest endpoint returned 404 at fixture capture time.
    if (
      url.pathname === "/search/suggest.json" &&
      url.searchParams.get("q") === "a80e7"
    ) {
      return Promise.resolve(new Response(null, { status: 404 }));
    }
    throw new Error(`Unexpected fixture request: ${url}`);
  });
  try {
    const result = await createShopifyCableSource(
      ankerShopifyTemplate
    ).extractFromProductUrl(fixture.sourceUrl);
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

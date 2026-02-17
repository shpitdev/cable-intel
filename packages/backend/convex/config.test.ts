import { afterEach, describe, expect, it } from "bun:test";
import { getIngestConfig, ingestDefaults } from "./config";

const ORIGINAL_AI_GATEWAY_API_KEY = process.env.AI_GATEWAY_API_KEY;
const ORIGINAL_FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;

afterEach(() => {
  if (ORIGINAL_AI_GATEWAY_API_KEY === undefined) {
    process.env.AI_GATEWAY_API_KEY = undefined;
  } else {
    process.env.AI_GATEWAY_API_KEY = ORIGINAL_AI_GATEWAY_API_KEY;
  }

  if (ORIGINAL_FIRECRAWL_API_KEY === undefined) {
    process.env.FIRECRAWL_API_KEY = undefined;
  } else {
    process.env.FIRECRAWL_API_KEY = ORIGINAL_FIRECRAWL_API_KEY;
  }
});

describe("getIngestConfig", () => {
  it("throws when required secrets are missing", () => {
    process.env.AI_GATEWAY_API_KEY = undefined;
    process.env.FIRECRAWL_API_KEY = undefined;

    expect(() => getIngestConfig()).toThrow(
      "Missing required environment variable: AI_GATEWAY_API_KEY"
    );
  });

  it("returns required secrets with code defaults", () => {
    process.env.AI_GATEWAY_API_KEY = "test-ai-key";
    process.env.FIRECRAWL_API_KEY = "test-firecrawl-key";

    expect(getIngestConfig()).toEqual({
      aiGatewayApiKey: "test-ai-key",
      firecrawlApiKey: "test-firecrawl-key",
      model: ingestDefaults.model,
      maxParseRetries: ingestDefaults.maxParseRetries,
      initialRetryDelayMs: ingestDefaults.initialRetryDelayMs,
      maxRetryDelayMs: ingestDefaults.maxRetryDelayMs,
    });
  });
});

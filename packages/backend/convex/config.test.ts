import { afterEach, describe, expect, it } from "bun:test";
import {
  getIngestConfig,
  getManualInferenceConfig,
  ingestDefaults,
  manualInferenceDefaults,
} from "./config";

const ENV_KEYS = [
  "AI_GATEWAY_API_KEY",
  "FIRECRAWL_API_KEY",
  "AI_SDK_TELEMETRY_ENABLED",
  "AI_SDK_TELEMETRY_RECORD_INPUTS",
  "AI_SDK_TELEMETRY_RECORD_OUTPUTS",
  "MANUAL_INFERENCE_MODEL",
] as const;
const originalEnv = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));

function unsetEnv(key: (typeof ENV_KEYS)[number]): void {
  // process.env stringifies undefined; absence requires deletion.
  delete process.env[key];
}

afterEach(() => {
  for (const [key, value] of originalEnv) {
    if (value === undefined) {
      unsetEnv(key);
    } else {
      process.env[key] = value;
    }
  }
});

describe("getIngestConfig", () => {
  it("throws when required secrets are missing", () => {
    unsetEnv("AI_GATEWAY_API_KEY");
    unsetEnv("FIRECRAWL_API_KEY");

    expect(() => getIngestConfig()).toThrow(
      "Missing required environment variable: AI_GATEWAY_API_KEY"
    );
  });

  it("returns required secrets with code defaults", () => {
    process.env.AI_GATEWAY_API_KEY = "test-ai-key";
    process.env.FIRECRAWL_API_KEY = "test-firecrawl-key";
    unsetEnv("AI_SDK_TELEMETRY_ENABLED");
    unsetEnv("AI_SDK_TELEMETRY_RECORD_INPUTS");
    unsetEnv("AI_SDK_TELEMETRY_RECORD_OUTPUTS");

    expect(getIngestConfig()).toEqual({
      aiTelemetryEnabled: ingestDefaults.aiTelemetryEnabled,
      aiTelemetryRecordInputs: ingestDefaults.aiTelemetryRecordInputs,
      aiTelemetryRecordOutputs: ingestDefaults.aiTelemetryRecordOutputs,
      aiGatewayApiKey: "test-ai-key",
      firecrawlApiKey: "test-firecrawl-key",
      model: ingestDefaults.model,
      maxParseRetries: ingestDefaults.maxParseRetries,
      initialRetryDelayMs: ingestDefaults.initialRetryDelayMs,
      maxRetryDelayMs: ingestDefaults.maxRetryDelayMs,
    });
  });

  it("parses telemetry boolean env overrides", () => {
    process.env.AI_GATEWAY_API_KEY = "test-ai-key";
    process.env.FIRECRAWL_API_KEY = "test-firecrawl-key";
    process.env.AI_SDK_TELEMETRY_ENABLED = "false";
    process.env.AI_SDK_TELEMETRY_RECORD_INPUTS = "1";
    process.env.AI_SDK_TELEMETRY_RECORD_OUTPUTS = "yes";

    expect(getIngestConfig()).toMatchObject({
      aiTelemetryEnabled: false,
      aiTelemetryRecordInputs: true,
      aiTelemetryRecordOutputs: true,
    });
  });

  it("throws on invalid telemetry boolean env values", () => {
    process.env.AI_GATEWAY_API_KEY = "test-ai-key";
    process.env.FIRECRAWL_API_KEY = "test-firecrawl-key";
    process.env.AI_SDK_TELEMETRY_ENABLED = "maybe";

    expect(() => getIngestConfig()).toThrow(
      "Invalid boolean environment variable: AI_SDK_TELEMETRY_ENABLED=maybe"
    );
  });
});

describe("getManualInferenceConfig", () => {
  it("requires AI gateway key", () => {
    unsetEnv("AI_GATEWAY_API_KEY");
    unsetEnv("MANUAL_INFERENCE_MODEL");

    expect(() => getManualInferenceConfig()).toThrow(
      "Missing required environment variable: AI_GATEWAY_API_KEY"
    );
  });

  it("returns manual defaults when optional values are absent", () => {
    process.env.AI_GATEWAY_API_KEY = "manual-ai-key";
    unsetEnv("MANUAL_INFERENCE_MODEL");
    unsetEnv("AI_SDK_TELEMETRY_ENABLED");
    unsetEnv("AI_SDK_TELEMETRY_RECORD_INPUTS");
    unsetEnv("AI_SDK_TELEMETRY_RECORD_OUTPUTS");

    expect(getManualInferenceConfig()).toEqual({
      aiGatewayApiKey: "manual-ai-key",
      aiTelemetryEnabled: manualInferenceDefaults.aiTelemetryEnabled,
      aiTelemetryRecordInputs: manualInferenceDefaults.aiTelemetryRecordInputs,
      aiTelemetryRecordOutputs:
        manualInferenceDefaults.aiTelemetryRecordOutputs,
      model: manualInferenceDefaults.model,
    });
  });

  it("accepts MANUAL_INFERENCE_MODEL override", () => {
    const overrideModel = "openai/gpt-oss-120b-test-override";
    process.env.AI_GATEWAY_API_KEY = "manual-ai-key";
    process.env.MANUAL_INFERENCE_MODEL = overrideModel;

    expect(getManualInferenceConfig().model).toBe(overrideModel);
  });
});

import { afterEach, describe, expect, it } from "bun:test";
import {
  getIngestConfig,
  getManualInferenceConfig,
  ingestDefaults,
  manualInferenceDefaults,
} from "./config";

const ORIGINAL_AI_GATEWAY_API_KEY = process.env.AI_GATEWAY_API_KEY;
const ORIGINAL_FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;
const ORIGINAL_AI_SDK_TELEMETRY_ENABLED = process.env.AI_SDK_TELEMETRY_ENABLED;
const ORIGINAL_AI_SDK_TELEMETRY_RECORD_INPUTS =
  process.env.AI_SDK_TELEMETRY_RECORD_INPUTS;
const ORIGINAL_AI_SDK_TELEMETRY_RECORD_OUTPUTS =
  process.env.AI_SDK_TELEMETRY_RECORD_OUTPUTS;
const ORIGINAL_MANUAL_INFERENCE_MODEL = process.env.MANUAL_INFERENCE_MODEL;

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

  if (ORIGINAL_AI_SDK_TELEMETRY_ENABLED === undefined) {
    process.env.AI_SDK_TELEMETRY_ENABLED = undefined;
  } else {
    process.env.AI_SDK_TELEMETRY_ENABLED = ORIGINAL_AI_SDK_TELEMETRY_ENABLED;
  }

  if (ORIGINAL_AI_SDK_TELEMETRY_RECORD_INPUTS === undefined) {
    process.env.AI_SDK_TELEMETRY_RECORD_INPUTS = undefined;
  } else {
    process.env.AI_SDK_TELEMETRY_RECORD_INPUTS =
      ORIGINAL_AI_SDK_TELEMETRY_RECORD_INPUTS;
  }

  if (ORIGINAL_AI_SDK_TELEMETRY_RECORD_OUTPUTS === undefined) {
    process.env.AI_SDK_TELEMETRY_RECORD_OUTPUTS = undefined;
  } else {
    process.env.AI_SDK_TELEMETRY_RECORD_OUTPUTS =
      ORIGINAL_AI_SDK_TELEMETRY_RECORD_OUTPUTS;
  }

  if (ORIGINAL_MANUAL_INFERENCE_MODEL === undefined) {
    process.env.MANUAL_INFERENCE_MODEL = undefined;
  } else {
    process.env.MANUAL_INFERENCE_MODEL = ORIGINAL_MANUAL_INFERENCE_MODEL;
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
    process.env.AI_SDK_TELEMETRY_ENABLED = undefined;
    process.env.AI_SDK_TELEMETRY_RECORD_INPUTS = undefined;
    process.env.AI_SDK_TELEMETRY_RECORD_OUTPUTS = undefined;

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
    process.env.AI_GATEWAY_API_KEY = undefined;
    process.env.MANUAL_INFERENCE_MODEL = undefined;

    expect(() => getManualInferenceConfig()).toThrow(
      "Missing required environment variable: AI_GATEWAY_API_KEY"
    );
  });

  it("returns manual defaults when optional values are absent", () => {
    process.env.AI_GATEWAY_API_KEY = "manual-ai-key";
    process.env.MANUAL_INFERENCE_MODEL = undefined;
    process.env.AI_SDK_TELEMETRY_ENABLED = undefined;
    process.env.AI_SDK_TELEMETRY_RECORD_INPUTS = undefined;
    process.env.AI_SDK_TELEMETRY_RECORD_OUTPUTS = undefined;

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

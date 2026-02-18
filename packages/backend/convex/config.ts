const DEFAULT_INGEST_MODEL = "openai/gpt-oss-120b";
const DEFAULT_MAX_PARSE_RETRIES = 3;
const DEFAULT_INITIAL_RETRY_DELAY_MS = 1000;
const DEFAULT_MAX_RETRY_DELAY_MS = 30_000;
const DEFAULT_AI_SDK_TELEMETRY_ENABLED = true;
const DEFAULT_AI_SDK_TELEMETRY_RECORD_INPUTS = false;
const DEFAULT_AI_SDK_TELEMETRY_RECORD_OUTPUTS = false;

type RequiredEnvKey = "AI_GATEWAY_API_KEY" | "FIRECRAWL_API_KEY";
type BooleanEnvKey =
  | "AI_SDK_TELEMETRY_ENABLED"
  | "AI_SDK_TELEMETRY_RECORD_INPUTS"
  | "AI_SDK_TELEMETRY_RECORD_OUTPUTS";

const readRequiredEnv = (key: RequiredEnvKey): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const FALSE_VALUES = new Set(["0", "false", "no", "off"]);

const readBooleanEnv = (key: BooleanEnvKey, fallback: boolean): boolean => {
  const value = process.env[key];
  if (!value) {
    return fallback;
  }

  const normalized = value.toLowerCase().trim();
  if (TRUE_VALUES.has(normalized)) {
    return true;
  }

  if (FALSE_VALUES.has(normalized)) {
    return false;
  }

  throw new Error(
    `Invalid boolean environment variable: ${key}=${value}. Expected one of ${[
      ...TRUE_VALUES,
      ...FALSE_VALUES,
    ].join(", ")}`
  );
};

export const ingestDefaults = {
  model: DEFAULT_INGEST_MODEL,
  maxParseRetries: DEFAULT_MAX_PARSE_RETRIES,
  initialRetryDelayMs: DEFAULT_INITIAL_RETRY_DELAY_MS,
  maxRetryDelayMs: DEFAULT_MAX_RETRY_DELAY_MS,
  aiTelemetryEnabled: DEFAULT_AI_SDK_TELEMETRY_ENABLED,
  aiTelemetryRecordInputs: DEFAULT_AI_SDK_TELEMETRY_RECORD_INPUTS,
  aiTelemetryRecordOutputs: DEFAULT_AI_SDK_TELEMETRY_RECORD_OUTPUTS,
} as const;

export interface IngestConfig {
  aiGatewayApiKey: string;
  aiTelemetryEnabled: boolean;
  aiTelemetryRecordInputs: boolean;
  aiTelemetryRecordOutputs: boolean;
  firecrawlApiKey: string;
  initialRetryDelayMs: number;
  maxParseRetries: number;
  maxRetryDelayMs: number;
  model: string;
}

export const getIngestConfig = (): IngestConfig => {
  return {
    aiTelemetryEnabled: readBooleanEnv(
      "AI_SDK_TELEMETRY_ENABLED",
      ingestDefaults.aiTelemetryEnabled
    ),
    aiTelemetryRecordInputs: readBooleanEnv(
      "AI_SDK_TELEMETRY_RECORD_INPUTS",
      ingestDefaults.aiTelemetryRecordInputs
    ),
    aiTelemetryRecordOutputs: readBooleanEnv(
      "AI_SDK_TELEMETRY_RECORD_OUTPUTS",
      ingestDefaults.aiTelemetryRecordOutputs
    ),
    aiGatewayApiKey: readRequiredEnv("AI_GATEWAY_API_KEY"),
    firecrawlApiKey: readRequiredEnv("FIRECRAWL_API_KEY"),
    model: ingestDefaults.model,
    maxParseRetries: ingestDefaults.maxParseRetries,
    initialRetryDelayMs: ingestDefaults.initialRetryDelayMs,
    maxRetryDelayMs: ingestDefaults.maxRetryDelayMs,
  };
};

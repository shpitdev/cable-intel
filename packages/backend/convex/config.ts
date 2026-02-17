const DEFAULT_INGEST_MODEL = "openai/gpt-oss-120b";
const DEFAULT_MAX_PARSE_RETRIES = 3;
const DEFAULT_INITIAL_RETRY_DELAY_MS = 1000;
const DEFAULT_MAX_RETRY_DELAY_MS = 30_000;

type RequiredEnvKey = "AI_GATEWAY_API_KEY" | "FIRECRAWL_API_KEY";

const readRequiredEnv = (key: RequiredEnvKey): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

export const ingestDefaults = {
  model: DEFAULT_INGEST_MODEL,
  maxParseRetries: DEFAULT_MAX_PARSE_RETRIES,
  initialRetryDelayMs: DEFAULT_INITIAL_RETRY_DELAY_MS,
  maxRetryDelayMs: DEFAULT_MAX_RETRY_DELAY_MS,
} as const;

export interface IngestConfig {
  aiGatewayApiKey: string;
  firecrawlApiKey: string;
  initialRetryDelayMs: number;
  maxParseRetries: number;
  maxRetryDelayMs: number;
  model: string;
}

export const getIngestConfig = (): IngestConfig => {
  return {
    aiGatewayApiKey: readRequiredEnv("AI_GATEWAY_API_KEY"),
    firecrawlApiKey: readRequiredEnv("FIRECRAWL_API_KEY"),
    model: ingestDefaults.model,
    maxParseRetries: ingestDefaults.maxParseRetries,
    initialRetryDelayMs: ingestDefaults.initialRetryDelayMs,
    maxRetryDelayMs: ingestDefaults.maxRetryDelayMs,
  };
};

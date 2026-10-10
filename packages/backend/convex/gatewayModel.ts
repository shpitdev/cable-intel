import { createGateway } from "ai";
import type { IngestConfig } from "./config";

export function createGatewayModel(
  config: Pick<IngestConfig, "aiGatewayApiKey" | "model">
) {
  return createGateway({ apiKey: config.aiGatewayApiKey })(config.model);
}

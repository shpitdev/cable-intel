import type { ConnectorType, DataCapability } from "$lib/types";

const CONNECTOR_ALIASES: Record<string, ConnectorType> = {
  "USB-C": "USB-C",
  USBC: "USB-C",
  "TYPE-C": "USB-C",
  "USB TYPE-C": "USB-C",
  "USB A": "USB-A",
  "USB-A": "USB-A",
  USBA: "USB-A",
  LIGHTNING: "Lightning",
  "MICRO USB": "Micro-USB",
  "MICRO-USB": "Micro-USB",
  MICROUSB: "Micro-USB",
  UNKNOWN: "Unknown",
};
const RESOLUTION_P_REGEX = /(\d{3,4})p/;
const LIGHTNING_MAX_GBPS = 0.48;
const NUMERIC_TOKEN_REGEX = /\d+(?:\.\d+)?/g;
const GBPS_REGEX = /(\d+(?:\.\d+)?)\s*(?:g(?:b(?:it)?(?:\/s)?|bps))/gi;

const GENERATION_GBPS_HINTS: Array<{ gbps: number; regex: RegExp }> = [
  {
    gbps: 80,
    regex: /\b(?:usb\s*4\s*(?:v2|2\.0)|thunderbolt\s*5|tb\s*5)\b/i,
  },
  { gbps: 40, regex: /\b(?:usb\s*4|thunderbolt\s*4|tb\s*4)\b/i },
  { gbps: 40, regex: /\b(?:thunderbolt\s*3|tb\s*3)\b/i },
  { gbps: 20, regex: /\b(?:usb\s*)?3\.2\s*gen\s*2x2\b/i },
  {
    gbps: 10,
    regex: /\b(?:usb\s*(?:3\.2\s*gen\s*2|3\.1\s*gen\s*2)|(?:usb\s*)?3\.2)\b/i,
  },
  {
    gbps: 5,
    regex:
      /\b(?:usb\s*(?:3\.2\s*gen\s*1|3\.1\s*gen\s*1|3\.0)|(?:usb\s*)?3\.0)\b/i,
  },
  { gbps: LIGHTNING_MAX_GBPS, regex: /\b(?:usb\s*2(?:\.0)?|480\s*mbps)\b/i },
];

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

export const clampConfidence = (value: number): number => {
  return clamp(Math.round(value), 0, 100);
};

export const normalizeConnector = (value?: string): ConnectorType => {
  if (!value) {
    return "Unknown";
  }

  const normalized = value.trim().toUpperCase();
  return CONNECTOR_ALIASES[normalized] ?? "Unknown";
};

export const parsePositiveNumber = (value: string): number | undefined => {
  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }

  const matches = [...normalized.matchAll(NUMERIC_TOKEN_REGEX)]
    .map((match) => Number(match[0]))
    .filter((number) => Number.isFinite(number) && number >= 0);
  if (matches.length === 0) {
    return undefined;
  }

  return Math.max(...matches);
};

export const inferMaxGbpsFromGeneration = (
  generation?: string
): number | undefined => {
  if (!generation) {
    return undefined;
  }

  const normalized = generation.toLowerCase();
  let inferredFromGeneration: number | undefined;
  for (const hint of GENERATION_GBPS_HINTS) {
    if (hint.regex.test(normalized)) {
      inferredFromGeneration =
        inferredFromGeneration === undefined
          ? hint.gbps
          : Math.max(inferredFromGeneration, hint.gbps);
    }
  }

  const explicitGbps = [...normalized.matchAll(GBPS_REGEX)]
    .map((match) => Number(match[1]))
    .filter((number) => Number.isFinite(number) && number > 0);
  if (explicitGbps.length > 0) {
    const maxExplicitGbps = Math.max(...explicitGbps);
    return inferredFromGeneration === undefined
      ? maxExplicitGbps
      : Math.max(maxExplicitGbps, inferredFromGeneration);
  }

  return inferredFromGeneration;
};

export const getConnectorDataCeilingGbps = (
  connectorFrom: ConnectorType,
  connectorTo: ConnectorType
): number | undefined => {
  if (connectorFrom === "Lightning" || connectorTo === "Lightning") {
    return LIGHTNING_MAX_GBPS;
  }

  return undefined;
};

export const clampDataCapabilityByConnector = (
  data: DataCapability,
  connectorFrom: ConnectorType,
  connectorTo: ConnectorType
): DataCapability => {
  const connectorCeiling = getConnectorDataCeilingGbps(
    connectorFrom,
    connectorTo
  );
  if (typeof connectorCeiling !== "number") {
    return data;
  }

  const normalizedMaxGbps =
    typeof data.maxGbps === "number"
      ? Math.min(data.maxGbps, connectorCeiling)
      : connectorCeiling;
  const normalizedUsbGeneration = data.usbGeneration
    ?.toLowerCase()
    .includes("usb 2")
    ? data.usbGeneration
    : "USB 2.0 (Lightning ceiling)";

  return {
    ...data,
    maxGbps: normalizedMaxGbps,
    usbGeneration: normalizedUsbGeneration,
  };
};

export const resolutionRank = (resolution?: string): number | undefined => {
  if (!resolution) {
    return undefined;
  }

  const normalized = resolution.toLowerCase().replaceAll(/\s+/g, "");
  if (normalized.includes("8k")) {
    return 6;
  }
  if (normalized.includes("5k")) {
    return 5;
  }
  if (normalized.includes("4k") || normalized.includes("2160p")) {
    return 4;
  }
  if (normalized.includes("1440p") || normalized.includes("2k")) {
    return 3;
  }
  if (normalized.includes("1080p") || normalized.includes("fhd")) {
    return 2;
  }
  if (normalized.includes("720p") || normalized.includes("hd")) {
    return 1;
  }

  const pMatch = normalized.match(RESOLUTION_P_REGEX);
  if (!pMatch?.[1]) {
    return undefined;
  }

  const height = Number(pMatch[1]);
  if (height >= 4320) {
    return 6;
  }
  if (height >= 2880) {
    return 5;
  }
  if (height >= 2160) {
    return 4;
  }
  if (height >= 1440) {
    return 3;
  }
  if (height >= 1080) {
    return 2;
  }
  if (height >= 720) {
    return 1;
  }

  return undefined;
};

export const isSameConnectorPair = (
  leftFrom: ConnectorType,
  leftTo: ConnectorType,
  rightFrom: ConnectorType,
  rightTo: ConnectorType
): boolean => {
  const left = [leftFrom, leftTo].sort().join("::");
  const right = [rightFrom, rightTo].sort().join("::");
  return left === right;
};

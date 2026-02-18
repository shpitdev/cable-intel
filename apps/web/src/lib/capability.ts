import type { ConnectorType } from "$lib/types";

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
  if (!value.trim()) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined;
  }

  return parsed;
};

export const inferMaxGbpsFromGeneration = (
  generation?: string
): number | undefined => {
  if (!generation) {
    return undefined;
  }

  const normalized = generation.toLowerCase();
  if (
    normalized.includes("tb") ||
    normalized.includes("thunderbolt") ||
    normalized.includes("usb4")
  ) {
    return 40;
  }
  if (normalized.includes("20gbps") || normalized.includes("gen 2x2")) {
    return 20;
  }
  if (normalized.includes("10gbps") || normalized.includes("gen 2")) {
    return 10;
  }
  if (normalized.includes("5gbps") || normalized.includes("gen 1")) {
    return 5;
  }
  if (normalized.includes("usb2") || normalized.includes("480mbps")) {
    return 0.48;
  }
  return undefined;
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

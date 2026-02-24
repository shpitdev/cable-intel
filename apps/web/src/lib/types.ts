export type IdentifyMode = "catalog" | "markings";

export type AdapterColor = "Red" | "Orange" | "Green" | "Black" | "White";
export type VelcroColor = "Orange" | "Blue" | "Black" | "White";
export type LabelColor = AdapterColor | VelcroColor;

export const ADAPTER_COLORS: AdapterColor[] = [
  "Red",
  "Orange",
  "Green",
  "Black",
  "White",
];

export const VELCRO_COLORS: VelcroColor[] = [
  "Orange",
  "Blue",
  "Black",
  "White",
];

export const LABEL_COLOR_HEX: Record<LabelColor, string> = {
  Red: "#d8433e",
  Orange: "#ee8d23",
  Green: "#2b8f62",
  Blue: "#74accf",
  Black: "#22232a",
  White: "#f5f5f1",
};

export const HOLDER_BAMBU_PETG_HF_HEX: Record<LabelColor, string> = {
  Red: "#cc4c46",
  Orange: "#d9843e",
  Green: "#3e9162",
  Blue: "#669fc2",
  Black: "#2b2f35",
  White: "#f0eee6",
};

export const VELCRO_CABLE_MATTERS_HEX: Record<LabelColor, string> = {
  Red: "#dc5a53",
  Orange: "#f29a45",
  Green: "#4f9d73",
  Blue: "#89c6de",
  Black: "#1f2228",
  White: "#dcd8cd",
};

export const CONNECTOR_OPTIONS = [
  "USB-C",
  "USB-A",
  "Lightning",
  "Micro-USB",
  "Unknown",
] as const;

export type ConnectorType = (typeof CONNECTOR_OPTIONS)[number];

export interface PowerCapability {
  eprSupported?: boolean;
  maxWatts?: number;
  pdSupported?: boolean;
}

export interface DataCapability {
  maxGbps?: number;
  usbGeneration?: string;
}

export interface VideoCapability {
  explicitlySupported?: boolean;
  maxRefreshHz?: number;
  maxResolution?: string;
}

export interface CableProfile {
  brand?: string;
  connectorFrom: ConnectorType;
  connectorTo: ConnectorType;
  data: DataCapability;
  displayName?: string;
  evidenceRefs?: CatalogEvidenceRef[];
  imageUrls?: string[];
  model?: string;
  power: PowerCapability;
  productUrl?: string;
  sku?: string;
  source: "catalog" | "markings";
  variant?: string;
  variantId?: string;
  video: VideoCapability;
}

export interface CatalogCableRow {
  brand: string;
  connectorFrom: string;
  connectorTo: string;
  data: DataCapability;
  evidenceRefs?: CatalogEvidenceRef[];
  imageUrls: string[];
  model: string;
  power: PowerCapability;
  productUrl?: string;
  sku?: string;
  variant?: string;
  variantId: string;
  video: VideoCapability;
}

export interface CatalogEvidenceRef {
  fieldPath: string;
  snippet?: string;
}

export interface MarkingsDraft {
  connectorFrom: ConnectorType;
  connectorTo: ConnectorType;
  dataOnly: boolean;
  gbps: string;
  maxRefreshHz: string;
  maxResolution: string;
  usbGeneration: string;
  videoSupport: "unknown" | "yes" | "no";
  watts: string;
}

export interface LabelRecommendation {
  adapterColor: AdapterColor;
  reasons: string[];
  velcroColor: VelcroColor;
}

export const DEFAULT_MARKINGS_DRAFT: MarkingsDraft = {
  connectorFrom: "Unknown",
  connectorTo: "Unknown",
  watts: "",
  usbGeneration: "",
  gbps: "",
  videoSupport: "unknown",
  maxResolution: "",
  maxRefreshHz: "",
  dataOnly: false,
};

import { z } from "zod";

export const CONNECTOR_VALUES = [
  "USB-C",
  "USB-A",
  "Lightning",
  "Micro-USB",
  "Unknown",
] as const;

export const VIDEO_SUPPORT_VALUES = ["unknown", "yes", "no"] as const;
export const FOLLOW_UP_CATEGORY_VALUES = [
  "connector",
  "power",
  "data",
  "video",
] as const;
export const FOLLOW_UP_ANSWER_VALUES = ["yes", "no", "skip"] as const;
export const MANUAL_INFERENCE_STATUS_VALUES = [
  "idle",
  "inference_running",
  "needs_followup",
  "ready",
  "failed",
] as const;
export const CONFIDENCE_BAND_VALUES = ["low", "medium", "high"] as const;

export const connectorSchema = z.enum(CONNECTOR_VALUES);
export const videoSupportSchema = z.enum(VIDEO_SUPPORT_VALUES);
export const followUpCategorySchema = z.enum(FOLLOW_UP_CATEGORY_VALUES);
export const followUpAnswerSchema = z.enum(FOLLOW_UP_ANSWER_VALUES);
export const manualInferenceStatusSchema = z.enum(
  MANUAL_INFERENCE_STATUS_VALUES
);
export const confidenceBandSchema = z.enum(CONFIDENCE_BAND_VALUES);

export const manualDraftSchema = z
  .object({
    connectorFrom: connectorSchema,
    connectorTo: connectorSchema,
    dataOnly: z.boolean(),
    gbps: z.string(),
    maxRefreshHz: z.string(),
    maxResolution: z.string(),
    usbGeneration: z.string(),
    videoSupport: videoSupportSchema,
    watts: z.string(),
  })
  .strict();

export const manualDraftPatchSchema = z
  .object({
    connectorFrom: connectorSchema.optional(),
    connectorTo: connectorSchema.optional(),
    dataOnly: z.boolean().optional(),
    gbps: z.string().optional(),
    maxRefreshHz: z.string().optional(),
    maxResolution: z.string().optional(),
    usbGeneration: z.string().optional(),
    videoSupport: videoSupportSchema.optional(),
    watts: z.string().optional(),
  })
  .strict();

export const followUpQuestionSchema = z
  .object({
    answer: followUpAnswerSchema.optional(),
    applyIfNo: manualDraftPatchSchema,
    applyIfSkip: manualDraftPatchSchema,
    applyIfYes: manualDraftPatchSchema,
    category: followUpCategorySchema,
    detail: z.string().optional(),
    id: z.string().min(1),
    prompt: z.string().min(1),
    status: z.enum(["pending", "answered"]),
  })
  .strict();

export const manualInferenceLlmOutputSchema = z
  .object({
    confidence: z.number().min(0).max(1),
    draftPatch: manualDraftPatchSchema,
    notes: z.string().trim().min(1).max(240).optional(),
    uncertainties: z.array(followUpCategorySchema).max(4).default([]),
  })
  .strict();

export const DEFAULT_MANUAL_DRAFT: ManualDraft = {
  connectorFrom: "USB-C",
  connectorTo: "USB-C",
  dataOnly: false,
  gbps: "",
  maxRefreshHz: "",
  maxResolution: "",
  usbGeneration: "",
  videoSupport: "unknown",
  watts: "",
};

const WHITESPACE_REGEX = /\s+/g;
const CONNECTOR_PAIR_REGEX =
  /\b(?:usb\s*-?\s*c|type\s*-?\s*c|usbc|usb\s*-?\s*a|usba|lightning|micro\s*-?\s*usb|microusb)\b\s*(?:to|\u2192|->|\/)\s*\b(?:usb\s*-?\s*c|type\s*-?\s*c|usbc|usb\s*-?\s*a|usba|lightning|micro\s*-?\s*usb|microusb)\b/gi;
const CONNECTOR_SPLIT_REGEX = /\b(?:to|\u2192|->|\/)\b/i;
const WATTS_REGEX = /\b(\d{1,3})(?:\s*)(?:w|watts?)\b/gi;
const GIGABIT_REGEX = /\b(\d{1,3}(?:\.\d+)?)\s*(?:gbps|gbit\/s|gb\/s)\b/i;
const REFRESH_HZ_REGEX = /\b(\d{2,3})\s*hz\b/i;

const CONNECTOR_MATCHERS: Array<{
  connector: ConnectorType;
  regex: RegExp;
}> = [
  {
    connector: "USB-C",
    regex: /\b(?:usb\s*-?\s*c|type\s*-?\s*c|usbc)\b/gi,
  },
  {
    connector: "USB-A",
    regex: /\b(?:usb\s*-?\s*a|usba)\b/gi,
  },
  {
    connector: "Lightning",
    regex: /\blightning\b/gi,
  },
  {
    connector: "Micro-USB",
    regex: /\b(?:micro\s*-?\s*usb|microusb)\b/gi,
  },
];

const GENERATION_HINTS: Array<{
  impliedGbps?: string;
  label: string;
  regex: RegExp;
}> = [
  {
    impliedGbps: "80",
    label: "USB4 v2 / Thunderbolt 5",
    regex: /\b(?:usb\s*4\s*(?:v2|2\.0)?|thunderbolt\s*5|tb5)\b/i,
  },
  {
    impliedGbps: "40",
    label: "USB4 / Thunderbolt 4",
    regex: /\b(?:usb\s*4|thunderbolt\s*4|tb4)\b/i,
  },
  {
    impliedGbps: "40",
    label: "Thunderbolt 3",
    regex: /\b(?:thunderbolt\s*3|tb3)\b/i,
  },
  {
    impliedGbps: "20",
    label: "USB 3.2 Gen 2x2",
    regex: /\busb\s*3\.2\s*gen\s*2x2\b/i,
  },
  {
    impliedGbps: "10",
    label: "USB 3.2 Gen 2",
    regex: /\busb\s*(?:3\.2\s*gen\s*2|3\.1\s*gen\s*2)\b/i,
  },
  {
    impliedGbps: "5",
    label: "USB 3.x",
    regex: /\busb\s*(?:3\.2\s*gen\s*1|3\.1\s*gen\s*1|3\.0)\b/i,
  },
  {
    impliedGbps: "0.48",
    label: "USB 2.0",
    regex: /\busb\s*2(?:\.0)?\b/i,
  },
];

const VIDEO_NEGATIVE_REGEX =
  /\b(?:no\s+video|video\s+not\s+supported|charge\s+only|charging\s+only)\b/i;
const VIDEO_POSITIVE_REGEX =
  /\b(?:displayport|dp\s*alt|alt\s*mode|video|monitor|\d+k)\b/i;

const RESOLUTION_HINTS: Array<{ label: string; regex: RegExp }> = [
  { label: "8K", regex: /\b8k\b/i },
  { label: "6K", regex: /\b6k\b/i },
  { label: "5K", regex: /\b5k\b/i },
  { label: "4K", regex: /\b4k\b/i },
  { label: "1440p", regex: /\b1440p\b/i },
  { label: "1080p", regex: /\b1080p\b/i },
];

const DATA_ONLY_REGEX =
  /\b(?:data\s*only|sync\s*only|non\s*charging|no\s+charging|without\s+charging)\b/i;
const CHARGING_REGEX =
  /\b(?:charging|charge|power\s*delivery|\bpd\b|\d{1,3}\s*w)\b/i;

const trimInput = (value: string): string => {
  return value.replaceAll(WHITESPACE_REGEX, " ").trim();
};

const unique = <T extends string>(values: readonly T[]): T[] => {
  return [...new Set(values)];
};

const normalizeConnectorToken = (value: string): ConnectorType => {
  const normalized = value.toLowerCase().replaceAll(/[^a-z0-9]+/g, "");
  if (normalized.includes("usbc") || normalized.includes("typec")) {
    return "USB-C";
  }
  if (normalized.includes("usba")) {
    return "USB-A";
  }
  if (normalized.includes("lightning")) {
    return "Lightning";
  }
  if (normalized.includes("microusb")) {
    return "Micro-USB";
  }
  return "Unknown";
};

const matchConnectorPair = (
  prompt: string
): { from: ConnectorType; to: ConnectorType } | null => {
  const match = CONNECTOR_PAIR_REGEX.exec(prompt);
  CONNECTOR_PAIR_REGEX.lastIndex = 0;
  if (!match?.[0]) {
    return null;
  }

  const [leftToken = "", rightToken = ""] = match[0]
    .split(CONNECTOR_SPLIT_REGEX)
    .map((token) => token.trim());
  const from = normalizeConnectorToken(leftToken);
  const to = normalizeConnectorToken(rightToken);

  if (from === "Unknown" || to === "Unknown") {
    return null;
  }
  return { from, to };
};

const findConnectorMentions = (prompt: string): ConnectorType[] => {
  const mentions: Array<{ connector: ConnectorType; index: number }> = [];

  for (const matcher of CONNECTOR_MATCHERS) {
    for (const match of prompt.matchAll(matcher.regex)) {
      if (typeof match.index !== "number") {
        continue;
      }
      mentions.push({
        connector: matcher.connector,
        index: match.index,
      });
    }
  }

  return mentions
    .sort((left, right) => left.index - right.index)
    .map((item) => item.connector);
};

const parseMaxWatts = (prompt: string): string | undefined => {
  const matches = [...prompt.matchAll(WATTS_REGEX)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (matches.length === 0) {
    return undefined;
  }

  const max = Math.max(...matches);
  return String(Math.round(max));
};

const parseGbps = (prompt: string): string | undefined => {
  const match = prompt.match(GIGABIT_REGEX);
  const raw = match?.[1];
  if (!raw) {
    return undefined;
  }
  const asNumber = Number(raw);
  if (!Number.isFinite(asNumber) || asNumber <= 0) {
    return undefined;
  }
  return String(asNumber);
};

const parseGenerationHint = (
  prompt: string
): { impliedGbps?: string; label: string } | null => {
  for (const hint of GENERATION_HINTS) {
    if (hint.regex.test(prompt)) {
      return {
        impliedGbps: hint.impliedGbps,
        label: hint.label,
      };
    }
  }
  return null;
};

const parseResolutionHint = (prompt: string): string | undefined => {
  for (const hint of RESOLUTION_HINTS) {
    if (hint.regex.test(prompt)) {
      return hint.label;
    }
  }
  return undefined;
};

const parseRefreshHint = (prompt: string): string | undefined => {
  const match = prompt.match(REFRESH_HZ_REGEX);
  const raw = match?.[1];
  if (!raw) {
    return undefined;
  }
  const asNumber = Number(raw);
  if (!Number.isFinite(asNumber) || asNumber <= 0) {
    return undefined;
  }
  return String(Math.round(asNumber));
};

const parseVideoSupport = (prompt: string): VideoSupport => {
  if (VIDEO_NEGATIVE_REGEX.test(prompt)) {
    return "no";
  }
  if (VIDEO_POSITIVE_REGEX.test(prompt)) {
    return "yes";
  }
  return "unknown";
};

const parseDataOnlyHint = (prompt: string): boolean | undefined => {
  if (DATA_ONLY_REGEX.test(prompt)) {
    return true;
  }
  if (CHARGING_REGEX.test(prompt)) {
    return false;
  }
  return undefined;
};

const normalizePatch = (patch: ManualDraftPatch): ManualDraftPatch => {
  const parsed = manualDraftPatchSchema.parse(patch);
  const normalized: ManualDraftPatch = {
    ...parsed,
  };

  if (typeof normalized.watts === "string") {
    normalized.watts = trimInput(normalized.watts);
  }
  if (typeof normalized.usbGeneration === "string") {
    normalized.usbGeneration = trimInput(normalized.usbGeneration);
  }
  if (typeof normalized.gbps === "string") {
    normalized.gbps = trimInput(normalized.gbps);
  }
  if (typeof normalized.maxResolution === "string") {
    normalized.maxResolution = trimInput(normalized.maxResolution);
  }
  if (typeof normalized.maxRefreshHz === "string") {
    normalized.maxRefreshHz = trimInput(normalized.maxRefreshHz);
  }

  return normalized;
};

export const applyDraftPatch = (
  draft: ManualDraft,
  patch: ManualDraftPatch
): ManualDraft => {
  const normalizedPatch = normalizePatch(patch);
  return manualDraftSchema.parse({
    ...draft,
    ...normalizedPatch,
  });
};

const mergePatchesWithPriority = (
  preferredPatch: ManualDraftPatch,
  secondaryPatch: ManualDraftPatch
): ManualDraftPatch => {
  const preferred = normalizePatch(preferredPatch);
  const secondary = normalizePatch(secondaryPatch);

  const merged: ManualDraftPatch = {
    ...preferred,
  };

  if (
    merged.connectorFrom === undefined &&
    secondary.connectorFrom !== undefined
  ) {
    merged.connectorFrom = secondary.connectorFrom;
  }
  if (merged.connectorTo === undefined && secondary.connectorTo !== undefined) {
    merged.connectorTo = secondary.connectorTo;
  }
  if (merged.dataOnly === undefined && secondary.dataOnly !== undefined) {
    merged.dataOnly = secondary.dataOnly;
  }
  if (merged.gbps === undefined && secondary.gbps !== undefined) {
    merged.gbps = secondary.gbps;
  }
  if (
    merged.maxRefreshHz === undefined &&
    secondary.maxRefreshHz !== undefined
  ) {
    merged.maxRefreshHz = secondary.maxRefreshHz;
  }
  if (
    merged.maxResolution === undefined &&
    secondary.maxResolution !== undefined
  ) {
    merged.maxResolution = secondary.maxResolution;
  }
  if (
    merged.usbGeneration === undefined &&
    secondary.usbGeneration !== undefined
  ) {
    merged.usbGeneration = secondary.usbGeneration;
  }
  if (
    merged.videoSupport === undefined &&
    secondary.videoSupport !== undefined
  ) {
    merged.videoSupport = secondary.videoSupport;
  }
  if (merged.watts === undefined && secondary.watts !== undefined) {
    merged.watts = secondary.watts;
  }

  return merged;
};

const calculateConfidenceBand = (value: number): ConfidenceBand => {
  if (value < 0.55) {
    return "low";
  }
  if (value < 0.78) {
    return "medium";
  }
  return "high";
};

const toClampedConfidence = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 0.99) {
    return 0.99;
  }
  return Number(value.toFixed(2));
};

const applyConnectorSignals = (
  prompt: string,
  patch: ManualDraftPatch,
  notes: string[]
): number => {
  const pair = matchConnectorPair(prompt);
  const connectorMentions = findConnectorMentions(prompt);

  if (pair) {
    patch.connectorFrom = pair.from;
    patch.connectorTo = pair.to;
    notes.push(`${pair.from} to ${pair.to} connector pair detected.`);
    return connectorMentions.length;
  }

  if (connectorMentions.length === 1) {
    const only = connectorMentions[0];
    if (only) {
      patch.connectorFrom = only;
      patch.connectorTo = only;
      notes.push(`Single connector mention detected (${only}).`);
    }
    return connectorMentions.length;
  }

  if (connectorMentions.length >= 2) {
    const [from, to] = connectorMentions;
    if (from && to) {
      patch.connectorFrom = from;
      patch.connectorTo = to;
      notes.push(`${from} to ${to} inferred from connector mentions.`);
    }
  }

  return connectorMentions.length;
};

const applyPowerSignals = (
  prompt: string,
  patch: ManualDraftPatch,
  notes: string[]
): void => {
  const watts = parseMaxWatts(prompt);
  if (watts) {
    patch.watts = watts;
    patch.dataOnly = false;
    notes.push(`Wattage marker detected (${watts}W).`);
    return;
  }

  const dataOnly = parseDataOnlyHint(prompt);
  if (typeof dataOnly !== "boolean") {
    return;
  }
  patch.dataOnly = dataOnly;
  notes.push(
    dataOnly ? "Data-only signal detected." : "Charging signal detected."
  );
};

const applyDataSignals = (
  prompt: string,
  patch: ManualDraftPatch,
  notes: string[]
): void => {
  const parsedGbps = parseGbps(prompt);
  if (parsedGbps) {
    patch.gbps = parsedGbps;
    notes.push(`Throughput marker detected (${parsedGbps} Gbps).`);
  }

  const generation = parseGenerationHint(prompt);
  if (!generation) {
    return;
  }
  patch.usbGeneration = generation.label;
  if (!patch.gbps && generation.impliedGbps) {
    patch.gbps = generation.impliedGbps;
  }
  notes.push(`Data generation marker detected (${generation.label}).`);
};

const applyVideoSignals = (
  prompt: string,
  patch: ManualDraftPatch,
  notes: string[]
): void => {
  const videoSupport = parseVideoSupport(prompt);
  if (videoSupport !== "unknown") {
    patch.videoSupport = videoSupport;
    notes.push(
      videoSupport === "yes"
        ? "Video capability marker detected."
        : "Negative video-support marker detected."
    );
  }

  const resolution = parseResolutionHint(prompt);
  if (resolution) {
    patch.maxResolution = resolution;
    if (!patch.videoSupport || patch.videoSupport === "unknown") {
      patch.videoSupport = "yes";
    }
    notes.push(`Resolution marker detected (${resolution}).`);
  }

  const refreshHz = parseRefreshHint(prompt);
  if (!refreshHz) {
    return;
  }
  patch.maxRefreshHz = refreshHz;
  if (!patch.videoSupport || patch.videoSupport === "unknown") {
    patch.videoSupport = "yes";
  }
  notes.push(`Refresh-rate marker detected (${refreshHz}Hz).`);
};

const inferDeterministicSignals = (
  rawPrompt: string
): {
  confidence: number;
  connectorMentionCount: number;
  notes: string[];
  patch: ManualDraftPatch;
  uncertainties: FollowUpCategory[];
} => {
  const prompt = trimInput(rawPrompt.toLowerCase());

  const notes: string[] = [];
  const patch: ManualDraftPatch = {};
  const connectorMentionCount = applyConnectorSignals(prompt, patch, notes);
  applyPowerSignals(prompt, patch, notes);
  applyDataSignals(prompt, patch, notes);
  applyVideoSignals(prompt, patch, notes);

  const resolvedCategories: FollowUpCategory[] = [];
  if (patch.connectorFrom && patch.connectorTo) {
    resolvedCategories.push("connector");
  }
  if (patch.watts || typeof patch.dataOnly === "boolean") {
    resolvedCategories.push("power");
  }
  if (patch.gbps || patch.usbGeneration) {
    resolvedCategories.push("data");
  }
  if (patch.videoSupport && patch.videoSupport !== "unknown") {
    resolvedCategories.push("video");
  }

  const unresolvedCategories = FOLLOW_UP_CATEGORY_VALUES.filter((category) => {
    return !resolvedCategories.includes(category);
  });

  const resolvedCount = resolvedCategories.length;
  let confidence = 0.23 + resolvedCount * 0.17;
  if (connectorMentionCount === 1) {
    confidence -= 0.06;
  }
  if (notes.length > 0) {
    confidence += 0.06;
  }

  return {
    confidence: toClampedConfidence(confidence),
    connectorMentionCount,
    notes,
    patch: normalizePatch(patch),
    uncertainties: unresolvedCategories,
  };
};

const getQuestionFromCategory = (
  category: FollowUpCategory,
  index: number
): FollowUpQuestion => {
  const id = `q-${category}-${index + 1}`;

  if (category === "power") {
    return {
      id,
      category,
      prompt: "Does the cable label mention 100W or higher charging?",
      detail:
        "Answering yes sets a 100W baseline. You can edit the exact value afterward.",
      status: "pending",
      applyIfYes: {
        dataOnly: false,
        watts: "100",
      },
      applyIfNo: {
        dataOnly: false,
      },
      applyIfSkip: {},
    };
  }

  if (category === "data") {
    return {
      id,
      category,
      prompt: "Does it explicitly mention USB4 or Thunderbolt support?",
      detail:
        "Answering yes pre-fills USB4 class and 40 Gbps as a starting point.",
      status: "pending",
      applyIfYes: {
        gbps: "40",
        usbGeneration: "USB4 / Thunderbolt 4",
      },
      applyIfNo: {},
      applyIfSkip: {},
    };
  }

  if (category === "video") {
    return {
      id,
      category,
      prompt:
        "Does the packaging mention video output (4K/8K, DisplayPort, or Alt Mode)?",
      detail: "Answering yes marks video support as explicit.",
      status: "pending",
      applyIfYes: {
        videoSupport: "yes",
      },
      applyIfNo: {
        videoSupport: "no",
      },
      applyIfSkip: {},
    };
  }

  return {
    id,
    category,
    prompt: "Is this definitely a USB-C to USB-C cable?",
    detail: "Answering yes sets both connector ends to USB-C.",
    status: "pending",
    applyIfYes: {
      connectorFrom: "USB-C",
      connectorTo: "USB-C",
    },
    applyIfNo: {},
    applyIfSkip: {},
  };
};

const buildFollowUpQuestions = (
  uncertainties: readonly FollowUpCategory[]
): FollowUpQuestion[] => {
  const prioritized: FollowUpCategory[] = [
    "power",
    "data",
    "video",
    "connector",
  ];

  const uniqueUncertainties = unique(uncertainties);
  const ordered = prioritized.filter((category) => {
    return uniqueUncertainties.includes(category);
  });

  return ordered.slice(0, 3).map((category, index) => {
    return getQuestionFromCategory(category, index);
  });
};

const deriveOpenUncertainties = (draft: ManualDraft): FollowUpCategory[] => {
  const uncertainties: FollowUpCategory[] = [];

  if (draft.connectorFrom === "Unknown" || draft.connectorTo === "Unknown") {
    uncertainties.push("connector");
  }

  const hasPowerSignal = draft.watts.trim().length > 0 || draft.dataOnly;
  if (!hasPowerSignal) {
    uncertainties.push("power");
  }

  const hasDataSignal =
    draft.usbGeneration.trim().length > 0 || draft.gbps.trim().length > 0;
  if (!hasDataSignal) {
    uncertainties.push("data");
  }

  const hasVideoSignal = draft.videoSupport !== "unknown";
  if (!hasVideoSignal) {
    uncertainties.push("video");
  }

  return uncertainties;
};

export const mergeInferenceSignals = (args: {
  currentDraft: ManualDraft;
  deterministic: DeterministicInference;
  llmResult?: ManualInferenceLlmOutput;
  prompt: string;
}): InferenceMergeResult => {
  const { currentDraft, deterministic, llmResult, prompt } = args;

  const mergedPatch = llmResult
    ? mergePatchesWithPriority(deterministic.patch, llmResult.draftPatch)
    : deterministic.patch;

  const draft = applyDraftPatch(currentDraft, mergedPatch);

  const mergedUncertainties = unique([
    ...deterministic.uncertainties,
    ...(llmResult?.uncertainties ?? []),
    ...deriveOpenUncertainties(draft),
  ]);

  const questions = buildFollowUpQuestions(mergedUncertainties);

  const deterministicWeight = llmResult ? 0.35 : 1;
  const llmWeight = llmResult ? 0.65 : 0;
  const confidence = toClampedConfidence(
    deterministic.confidence * deterministicWeight +
      (llmResult?.confidence ?? 0) * llmWeight
  );
  const confidenceBand = calculateConfidenceBand(confidence);

  const notes = llmResult?.notes
    ? llmResult.notes
    : deterministic.notes.join(" ");

  const status: ManualInferenceStatus =
    questions.length > 0 && confidence < 0.78 ? "needs_followup" : "ready";

  const normalizedPrompt = trimInput(prompt);

  return {
    confidence,
    confidenceBand,
    draft,
    followUpQuestions: questions,
    notes: notes || undefined,
    prompt: normalizedPrompt,
    status,
  };
};

export const inferDeterministic = (prompt: string): DeterministicInference => {
  return inferDeterministicSignals(prompt);
};

export const applyQuestionAnswerPatch = (
  draft: ManualDraft,
  question: FollowUpQuestion,
  answer: FollowUpAnswer
): ManualDraft => {
  if (answer === "yes") {
    return applyDraftPatch(draft, question.applyIfYes);
  }
  if (answer === "no") {
    return applyDraftPatch(draft, question.applyIfNo);
  }
  return applyDraftPatch(draft, question.applyIfSkip);
};

export const bumpConfidenceAfterAnswer = (
  confidence: number,
  answer: FollowUpAnswer
): number => {
  const increment = answer === "skip" ? 0.03 : 0.08;
  return toClampedConfidence(confidence + increment);
};

export const parseManualInferenceLlmOutput = (
  value: unknown
): ManualInferenceLlmOutput => {
  return manualInferenceLlmOutputSchema.parse(value);
};

export const toConfidenceBand = (confidence: number): ConfidenceBand => {
  return calculateConfidenceBand(toClampedConfidence(confidence));
};

export type ConnectorType = z.infer<typeof connectorSchema>;
export type ConfidenceBand = z.infer<typeof confidenceBandSchema>;
export type FollowUpAnswer = z.infer<typeof followUpAnswerSchema>;
export type FollowUpCategory = z.infer<typeof followUpCategorySchema>;
export type FollowUpQuestion = z.infer<typeof followUpQuestionSchema>;
export type ManualDraft = z.infer<typeof manualDraftSchema>;
export type ManualDraftPatch = z.infer<typeof manualDraftPatchSchema>;
export type VideoSupport = z.infer<typeof videoSupportSchema>;
export type ManualInferenceLlmOutput = z.infer<
  typeof manualInferenceLlmOutputSchema
>;
export type ManualInferenceStatus = z.infer<typeof manualInferenceStatusSchema>;

export interface DeterministicInference {
  confidence: number;
  connectorMentionCount: number;
  notes: string[];
  patch: ManualDraftPatch;
  uncertainties: FollowUpCategory[];
}

export interface InferenceMergeResult {
  confidence: number;
  confidenceBand: ConfidenceBand;
  draft: ManualDraft;
  followUpQuestions: FollowUpQuestion[];
  notes?: string;
  prompt: string;
  status: Extract<ManualInferenceStatus, "needs_followup" | "ready">;
}

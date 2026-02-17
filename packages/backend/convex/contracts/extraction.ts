import { z } from "zod";

export const extractionInputSchema = z
  .object({
    url: z.string().url(),
    fetchedAt: z.number().int().nonnegative(),
    html: z.string().min(1),
    markdown: z.string().min(1),
  })
  .strict();

export const evidencePointerSchema = z
  .object({
    fieldPath: z.string().min(1),
    sourceUrl: z.string().url(),
    sourceContentHash: z.string().min(1).optional(),
    snippet: z.string().min(1).optional(),
  })
  .strict();

const powerCapabilitySchema = z
  .object({
    maxWatts: z.number().nonnegative().optional(),
    pdSupported: z.boolean().optional(),
    eprSupported: z.boolean().optional(),
  })
  .strict()
  .default({});

const dataCapabilitySchema = z
  .object({
    usbGeneration: z.string().min(1).optional(),
    maxGbps: z.number().nonnegative().optional(),
  })
  .strict()
  .default({});

const videoCapabilitySchema = z
  .object({
    explicitlySupported: z.boolean().optional(),
    maxResolution: z.string().min(1).optional(),
    maxRefreshHz: z.number().positive().optional(),
  })
  .strict()
  .default({});

const imageSchema = z
  .object({
    url: z.string().url(),
    alt: z.string().min(1).optional(),
  })
  .strict();

const hasEvidenceForFieldPath = (
  fieldPath: string,
  evidence: readonly { fieldPath: string }[]
): boolean => {
  return evidence.some((item) => item.fieldPath === fieldPath);
};

export const CRITICAL_EVIDENCE_FIELD_PATHS = [
  "brand",
  "model",
  "connectorPair.from",
  "connectorPair.to",
] as const;

export const extractionOutputSchema = z
  .object({
    brand: z.string().min(1),
    model: z.string().min(1),
    variant: z.string().min(1).optional(),
    sku: z.string().min(1).optional(),
    connectorPair: z
      .object({
        from: z.string().min(1),
        to: z.string().min(1),
      })
      .strict(),
    power: powerCapabilitySchema,
    data: dataCapabilitySchema,
    video: videoCapabilitySchema,
    images: z.array(imageSchema).default([]),
    evidence: z.array(evidencePointerSchema).min(1),
  })
  .strict()
  .superRefine((value, ctx) => {
    const missingCriticalFieldPaths = CRITICAL_EVIDENCE_FIELD_PATHS.filter(
      (fieldPath) => !hasEvidenceForFieldPath(fieldPath, value.evidence)
    );

    if (missingCriticalFieldPaths.length > 0) {
      ctx.addIssue({
        code: "custom",
        message: `Missing evidence for critical fields: ${missingCriticalFieldPaths.join(", ")}`,
      });
    }
  });

export type ExtractionInput = z.infer<typeof extractionInputSchema>;
export type ExtractionOutput = z.infer<typeof extractionOutputSchema>;

export const parseExtractionInput = (value: unknown): ExtractionInput => {
  return extractionInputSchema.parse(value);
};

export const parseExtractionOutput = (value: unknown): ExtractionOutput => {
  return extractionOutputSchema.parse(value);
};

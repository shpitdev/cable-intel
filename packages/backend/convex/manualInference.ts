import { gateway, generateObject } from "ai";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  internalQuery,
  type MutationCtx,
  mutation,
  type QueryCtx,
  query,
} from "./_generated/server";
import { getManualInferenceConfig, manualInferenceDefaults } from "./config";
import {
  applyDraftPatch,
  applyQuestionAnswerPatch,
  bumpConfidenceAfterAnswer,
  CONFIDENCE_BAND_VALUES,
  CONNECTOR_VALUES,
  DEFAULT_MANUAL_DRAFT,
  FOLLOW_UP_ANSWER_VALUES,
  FOLLOW_UP_CATEGORY_VALUES,
  type FollowUpQuestion,
  inferDeterministic,
  type ManualDraft,
  type ManualDraftPatch,
  type ManualInferenceLlmOutput,
  manualDraftPatchSchema,
  manualDraftSchema,
  manualInferenceLlmOutputSchema,
  mergeInferenceSignals,
  parseManualInferenceLlmOutput,
  toConfidenceBand,
  VIDEO_SUPPORT_VALUES,
} from "./manualInferenceLogic";

const connectorValidator = v.union(
  ...CONNECTOR_VALUES.map((connector) => v.literal(connector))
);
const videoSupportValidator = v.union(
  ...VIDEO_SUPPORT_VALUES.map((value) => v.literal(value))
);
const followUpCategoryValidator = v.union(
  ...FOLLOW_UP_CATEGORY_VALUES.map((value) => v.literal(value))
);
const followUpAnswerValidator = v.union(
  ...FOLLOW_UP_ANSWER_VALUES.map((value) => v.literal(value))
);
const confidenceBandValidator = v.union(
  ...CONFIDENCE_BAND_VALUES.map((band) => v.literal(band))
);

const manualDraftValidator = v.object({
  connectorFrom: connectorValidator,
  connectorTo: connectorValidator,
  dataOnly: v.boolean(),
  gbps: v.string(),
  maxRefreshHz: v.string(),
  maxResolution: v.string(),
  usbGeneration: v.string(),
  videoSupport: videoSupportValidator,
  watts: v.string(),
});

const manualDraftPatchValidator = v.object({
  connectorFrom: v.optional(connectorValidator),
  connectorTo: v.optional(connectorValidator),
  dataOnly: v.optional(v.boolean()),
  gbps: v.optional(v.string()),
  maxRefreshHz: v.optional(v.string()),
  maxResolution: v.optional(v.string()),
  usbGeneration: v.optional(v.string()),
  videoSupport: v.optional(videoSupportValidator),
  watts: v.optional(v.string()),
});

const followUpQuestionValidator = v.object({
  answer: v.optional(followUpAnswerValidator),
  applyIfNo: manualDraftPatchValidator,
  applyIfSkip: manualDraftPatchValidator,
  applyIfYes: manualDraftPatchValidator,
  category: followUpCategoryValidator,
  detail: v.optional(v.string()),
  id: v.string(),
  prompt: v.string(),
  status: v.union(v.literal("pending"), v.literal("answered")),
});

const normalizeWorkspaceId = (value: string): string => {
  return value.trim().toLowerCase();
};

const trimText = (value: string): string => {
  return value.replaceAll(/\s+/g, " ").trim();
};

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

const buildManualInferencePrompt = (args: {
  currentDraft: ManualDraft;
  deterministic: ReturnType<typeof inferDeterministic>;
  prompt: string;
}): string => {
  return [
    "User free-text description:",
    args.prompt,
    "",
    "Current manual draft JSON:",
    JSON.stringify(args.currentDraft, null, 2),
    "",
    "Deterministic parser hints (trust these over guesses):",
    JSON.stringify(
      {
        confidence: args.deterministic.confidence,
        notes: args.deterministic.notes,
        patch: args.deterministic.patch,
        uncertainties: args.deterministic.uncertainties,
      },
      null,
      2
    ),
    "",
    "Return ONLY schema-compliant JSON.",
  ].join("\n");
};

const MANUAL_INFERENCE_SYSTEM_PROMPT = [
  "You classify cable hints into structured manual-entry fields.",
  "Prefer best-effort extraction: infer likely values when text is suggestive, then lower confidence and list uncertainties.",
  "Return a patch, not a full object.",
  "Confidence must be 0..1 and reflect certainty.",
  "Uncertainties must be limited to connector, power, data, video.",
  "If a field is uncertain, still provide your best guess when probable instead of leaving everything blank.",
  "Connector values must be one of USB-C, USB-A, Lightning, Micro-USB, Unknown.",
  "videoSupport must be unknown, yes, or no.",
].join(" ");
const MANUAL_INFERENCE_LLM_TIMEOUT_MS = 8000;

type ReaderCtx = Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">;
type WriterCtx = Pick<MutationCtx, "db">;

const getSessionByWorkspace = async (
  ctx: ReaderCtx,
  workspaceId: string
): Promise<Doc<"manualInferenceSessions"> | null> => {
  const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
  return await ctx.db
    .query("manualInferenceSessions")
    .withIndex("by_workspace", (q) =>
      q.eq("workspaceId", normalizedWorkspaceId)
    )
    .first();
};

const createSession = async (
  ctx: WriterCtx,
  workspaceId: string,
  now: number
): Promise<Doc<"manualInferenceSessions">> => {
  const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
  const sessionId = await ctx.db.insert("manualInferenceSessions", {
    workspaceId: normalizedWorkspaceId,
    draft: DEFAULT_MANUAL_DRAFT,
    prompt: undefined,
    status: "idle",
    confidence: 0,
    confidenceBand: "low",
    notes: undefined,
    followUpQuestions: [],
    answeredQuestionCount: 0,
    llmUsed: false,
    lastError: undefined,
    lastInferenceAt: undefined,
    createdAt: now,
    updatedAt: now,
  });

  const created = await ctx.db.get(sessionId);
  if (!created) {
    throw new Error("Failed to create manual inference session");
  }
  return created;
};

const ensureSessionDoc = async (
  ctx: WriterCtx,
  workspaceId: string,
  now: number
): Promise<Doc<"manualInferenceSessions">> => {
  const existing = await getSessionByWorkspace(ctx, workspaceId);
  if (existing) {
    return existing;
  }
  return await createSession(ctx, workspaceId, now);
};

export const getSession = query({
  args: {
    workspaceId: v.string(),
  },
  handler: async (ctx, args) => {
    return await getSessionByWorkspace(ctx, args.workspaceId);
  },
});

export const ensureSessionInternal = internalMutation({
  args: {
    workspaceId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ensureSessionDoc(ctx, args.workspaceId, Date.now());
  },
});

export const getSessionInternal = internalQuery({
  args: {
    workspaceId: v.string(),
  },
  handler: async (ctx, args) => {
    return await getSessionByWorkspace(ctx, args.workspaceId);
  },
});

export const ensureSession = mutation({
  args: {
    workspaceId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ensureSessionDoc(ctx, args.workspaceId, Date.now());
  },
});

export const patchDraft = mutation({
  args: {
    workspaceId: v.string(),
    patch: manualDraftPatchValidator,
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const session = await ensureSessionDoc(ctx, args.workspaceId, now);
    const parsedPatch = manualDraftPatchSchema.parse(
      args.patch
    ) satisfies ManualDraftPatch;
    const nextDraft = applyDraftPatch(session.draft, parsedPatch);
    const nextStatus = session.status === "failed" ? "idle" : session.status;

    await ctx.db.patch(session._id, {
      draft: nextDraft,
      lastError: undefined,
      status: nextStatus,
      updatedAt: now,
    });

    const updated = await ctx.db.get(session._id);
    if (!updated) {
      throw new Error("Manual inference session disappeared after patchDraft");
    }
    return updated;
  },
});

export const resetSession = mutation({
  args: {
    workspaceId: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const session = await ensureSessionDoc(ctx, args.workspaceId, now);

    await ctx.db.patch(session._id, {
      answeredQuestionCount: 0,
      confidence: 0,
      confidenceBand: "low",
      draft: DEFAULT_MANUAL_DRAFT,
      followUpQuestions: [],
      lastError: undefined,
      lastInferenceAt: now,
      llmUsed: false,
      notes: undefined,
      prompt: undefined,
      status: "idle",
      updatedAt: now,
    });

    const updated = await ctx.db.get(session._id);
    if (!updated) {
      throw new Error(
        "Manual inference session disappeared after resetSession"
      );
    }
    return updated;
  },
});

export const setInferenceRunningInternal = internalMutation({
  args: {
    prompt: v.string(),
    workspaceId: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const session = await ensureSessionDoc(ctx, args.workspaceId, now);
    await ctx.db.patch(session._id, {
      lastError: undefined,
      notes: undefined,
      prompt: trimText(args.prompt),
      status: "inference_running",
      updatedAt: now,
    });
    const updated = await ctx.db.get(session._id);
    if (!updated) {
      throw new Error(
        "Manual inference session disappeared after setInferenceRunningInternal"
      );
    }
    return updated;
  },
});

export const applyInferenceResultInternal = internalMutation({
  args: {
    confidence: v.number(),
    confidenceBand: confidenceBandValidator,
    draft: manualDraftValidator,
    followUpQuestions: v.array(followUpQuestionValidator),
    llmUsed: v.boolean(),
    notes: v.optional(v.string()),
    prompt: v.string(),
    status: v.union(v.literal("needs_followup"), v.literal("ready")),
    workspaceId: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const session = await ensureSessionDoc(ctx, args.workspaceId, now);
    const answeredQuestionCount = args.followUpQuestions.filter((question) => {
      return question.status === "answered";
    }).length;

    await ctx.db.patch(session._id, {
      answeredQuestionCount,
      confidence: args.confidence,
      confidenceBand: args.confidenceBand,
      draft: args.draft,
      followUpQuestions: args.followUpQuestions,
      lastError: undefined,
      lastInferenceAt: now,
      llmUsed: args.llmUsed,
      notes: args.notes,
      prompt: args.prompt,
      status: args.status,
      updatedAt: now,
    });

    const updated = await ctx.db.get(session._id);
    if (!updated) {
      throw new Error(
        "Manual inference session disappeared after applyInferenceResultInternal"
      );
    }
    return updated;
  },
});

export const setInferenceFailedInternal = internalMutation({
  args: {
    error: v.string(),
    workspaceId: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const session = await ensureSessionDoc(ctx, args.workspaceId, now);
    await ctx.db.patch(session._id, {
      lastError: args.error,
      lastInferenceAt: now,
      status: "failed",
      updatedAt: now,
    });

    const updated = await ctx.db.get(session._id);
    if (!updated) {
      throw new Error(
        "Manual inference session disappeared after setInferenceFailedInternal"
      );
    }
    return updated;
  },
});

export const answerQuestion = mutation({
  args: {
    answer: followUpAnswerValidator,
    questionId: v.string(),
    workspaceId: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const session = await ensureSessionDoc(ctx, args.workspaceId, now);

    const targetIndex = session.followUpQuestions.findIndex((question) => {
      return question.id === args.questionId;
    });

    if (targetIndex < 0) {
      throw new Error(`Follow-up question not found: ${args.questionId}`);
    }

    const targetQuestion = session.followUpQuestions[targetIndex];
    if (!targetQuestion) {
      throw new Error(`Follow-up question missing at index: ${targetIndex}`);
    }

    if (targetQuestion.status === "answered") {
      return session;
    }

    const nextDraft = applyQuestionAnswerPatch(
      session.draft,
      targetQuestion,
      args.answer
    );

    const nextQuestions = session.followUpQuestions.map((question, index) => {
      if (index !== targetIndex) {
        return question;
      }
      return {
        ...question,
        answer: args.answer,
        status: "answered" as const,
      };
    });

    const answeredQuestionCount = nextQuestions.filter((question) => {
      return question.status === "answered";
    }).length;
    const pendingQuestionCount = nextQuestions.length - answeredQuestionCount;

    const nextConfidence = bumpConfidenceAfterAnswer(
      session.confidence,
      args.answer
    );
    const nextStatus = pendingQuestionCount > 0 ? "needs_followup" : "ready";

    await ctx.db.patch(session._id, {
      answeredQuestionCount,
      confidence: nextConfidence,
      confidenceBand: toConfidenceBand(nextConfidence),
      draft: nextDraft,
      followUpQuestions: nextQuestions,
      status: nextStatus,
      updatedAt: now,
    });

    const updated = await ctx.db.get(session._id);
    if (!updated) {
      throw new Error(
        "Manual inference session disappeared after answerQuestion"
      );
    }
    return updated;
  },
});

const runLlmInference = async (args: {
  currentDraft: ManualDraft;
  deterministic: ReturnType<typeof inferDeterministic>;
  prompt: string;
}): Promise<ManualInferenceLlmOutput> => {
  const providerConfig = getManualInferenceConfig();

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, MANUAL_INFERENCE_LLM_TIMEOUT_MS);

  try {
    const { object } = await generateObject({
      abortSignal: abortController.signal,
      maxRetries: 1,
      model: gateway(providerConfig.model),
      schema: manualInferenceLlmOutputSchema,
      system: MANUAL_INFERENCE_SYSTEM_PROMPT,
      prompt: buildManualInferencePrompt(args),
      temperature: 0,
      experimental_telemetry: {
        isEnabled: providerConfig.aiTelemetryEnabled,
        functionId: "convex.manualInference.submitPrompt",
        metadata: {
          mode: "manual",
          workspaceId: "redacted",
        },
        recordInputs: providerConfig.aiTelemetryRecordInputs,
        recordOutputs: providerConfig.aiTelemetryRecordOutputs,
      },
    });

    return parseManualInferenceLlmOutput(object);
  } catch (error) {
    if (abortController.signal.aborted) {
      throw new Error(
        `LLM timed out after ${MANUAL_INFERENCE_LLM_TIMEOUT_MS}ms`
      );
    }
    throw new Error(toErrorMessage(error));
  } finally {
    clearTimeout(timeoutId);
  }
};

export const submitPrompt = action({
  args: {
    prompt: v.string(),
    workspaceId: v.string(),
  },
  handler: async (
    ctx,
    args
  ): Promise<Doc<"manualInferenceSessions"> | null> => {
    const normalizedPrompt = trimText(args.prompt);
    const normalizedWorkspaceId = normalizeWorkspaceId(args.workspaceId);

    if (normalizedPrompt.length === 0) {
      await ctx.runMutation(
        internal.manualInference.setInferenceFailedInternal,
        {
          workspaceId: normalizedWorkspaceId,
          error: "Enter a description before running manual inference.",
        }
      );
      return await ctx.runQuery(internal.manualInference.getSessionInternal, {
        workspaceId: normalizedWorkspaceId,
      });
    }

    const initialSession: Doc<"manualInferenceSessions"> =
      await ctx.runMutation(internal.manualInference.ensureSessionInternal, {
        workspaceId: normalizedWorkspaceId,
      });

    await ctx.runMutation(
      internal.manualInference.setInferenceRunningInternal,
      {
        workspaceId: normalizedWorkspaceId,
        prompt: normalizedPrompt,
      }
    );

    const deterministic = inferDeterministic(normalizedPrompt);
    let llmResult: ManualInferenceLlmOutput;
    try {
      llmResult = await runLlmInference({
        currentDraft: initialSession.draft,
        deterministic,
        prompt: normalizedPrompt,
      });
    } catch (error) {
      const errorMessage = `LLM inference failed for ${normalizedWorkspaceId}: ${toErrorMessage(
        error
      )}`;
      await ctx.runMutation(
        internal.manualInference.setInferenceFailedInternal,
        {
          workspaceId: normalizedWorkspaceId,
          error: errorMessage,
        }
      );
      throw new Error(errorMessage);
    }

    const latestSession = await ctx.runQuery(
      internal.manualInference.getSessionInternal,
      {
        workspaceId: normalizedWorkspaceId,
      }
    );
    if (!latestSession) {
      throw new Error(
        `Manual inference session missing before merge for ${normalizedWorkspaceId}`
      );
    }

    const merged = mergeInferenceSignals({
      currentDraft: latestSession.draft,
      deterministic,
      llmResult,
      prompt: normalizedPrompt,
    });

    const mergedDraft = manualDraftSchema.parse(merged.draft);
    const mergedQuestions = merged.followUpQuestions.map((question) => {
      return {
        ...question,
      } satisfies FollowUpQuestion;
    });

    const updated: Doc<"manualInferenceSessions"> = await ctx.runMutation(
      internal.manualInference.applyInferenceResultInternal,
      {
        workspaceId: normalizedWorkspaceId,
        confidence: merged.confidence,
        confidenceBand: merged.confidenceBand,
        draft: mergedDraft,
        followUpQuestions: mergedQuestions,
        llmUsed: true,
        notes: merged.notes,
        prompt: merged.prompt,
        status: merged.status,
      }
    );

    return updated;
  },
});

export const getStatusSummary = query({
  args: {
    workspaceId: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await getSessionByWorkspace(ctx, args.workspaceId);
    if (!session) {
      return {
        confidence: 0,
        confidenceBand: "low" as const,
        followUpPending: 0,
        status: "idle" as const,
      };
    }

    const followUpPending = session.followUpQuestions.filter((question) => {
      return question.status === "pending";
    }).length;

    return {
      confidence: session.confidence,
      confidenceBand: session.confidenceBand,
      followUpPending,
      status: session.status,
    };
  },
});

export const getDefaults = query({
  args: {},
  handler: () => {
    return {
      defaultDraft: DEFAULT_MANUAL_DRAFT,
      defaultModel: manualInferenceDefaults.model,
      questionCategories: FOLLOW_UP_CATEGORY_VALUES,
    };
  },
});

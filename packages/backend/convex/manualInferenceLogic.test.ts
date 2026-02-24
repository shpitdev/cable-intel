import { describe, expect, it } from "bun:test";
import {
  applyQuestionAnswerPatch,
  DEFAULT_MANUAL_DRAFT,
  inferDeterministic,
  mergeInferenceSignals,
  parseManualInferenceLlmOutput,
} from "./manualInferenceLogic";

describe("manualInferenceLogic", () => {
  it("extracts deterministic cable hints from free text", () => {
    const deterministic = inferDeterministic(
      "USB-C to USB-C braided cable, 240W PD, USB4, 8K 120Hz"
    );

    expect(deterministic.patch.connectorFrom).toBe("USB-C");
    expect(deterministic.patch.connectorTo).toBe("USB-C");
    expect(deterministic.patch.watts).toBe("240");
    expect(deterministic.patch.usbGeneration).toContain("USB4");
    expect(deterministic.patch.videoSupport).toBe("yes");
    expect(deterministic.patch.maxResolution).toBe("8K");
    expect(deterministic.patch.maxRefreshHz).toBe("120");
    expect(deterministic.confidence).toBeGreaterThan(0.7);
  });

  it("merges deterministic + llm patch while preserving deterministic signals", () => {
    const deterministic = inferDeterministic(
      "USB-C to USB-C braided cable, 240W PD"
    );

    const llm = parseManualInferenceLlmOutput({
      confidence: 0.51,
      draftPatch: {
        gbps: "40",
        usbGeneration: "USB4 / Thunderbolt 4",
        watts: "100",
      },
      uncertainties: ["video"],
      notes: "Likely USB4-class cable but video support unclear.",
    });

    const merged = mergeInferenceSignals({
      currentDraft: DEFAULT_MANUAL_DRAFT,
      deterministic,
      llmResult: llm,
      prompt: "USB-C to USB-C braided cable, 240W PD",
    });

    expect(merged.draft.watts).toBe("240");
    expect(merged.draft.gbps).toBe("40");
    expect(merged.draft.usbGeneration).toContain("USB4");
    expect(merged.followUpQuestions.length).toBeLessThanOrEqual(3);
  });

  it("applies follow-up answer patch to the draft", () => {
    const question = {
      id: "q-video-1",
      category: "video" as const,
      prompt: "Does packaging mention video output?",
      detail: "",
      status: "pending" as const,
      applyIfYes: { videoSupport: "yes" as const },
      applyIfNo: { videoSupport: "no" as const },
      applyIfSkip: {},
    };

    const answered = applyQuestionAnswerPatch(
      DEFAULT_MANUAL_DRAFT,
      question,
      "yes"
    );

    expect(answered.videoSupport).toBe("yes");
  });
});

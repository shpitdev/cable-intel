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

  it("does not auto-fill both connector ends from a single connector mention", () => {
    const deterministic = inferDeterministic("usb-c braided charging cable");

    expect(deterministic.patch.connectorFrom).toBeUndefined();
    expect(deterministic.patch.connectorTo).toBeUndefined();
  });

  it("normalizes misspelled lightning mentions and applies lightning data ceiling", () => {
    const deterministic = inferDeterministic("usb c to lightening apple cable");

    expect(deterministic.patch.connectorFrom).toBe("USB-C");
    expect(deterministic.patch.connectorTo).toBe("Lightning");
    expect(deterministic.patch.usbGeneration).toContain("USB 2.0");
    expect(deterministic.patch.gbps).toBe("0.48");
    expect(deterministic.patch.videoSupport).toBe("no");
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
    expect(merged.followUpQuestions.length).toBeLessThanOrEqual(1);
  });

  it("avoids follow-up questions when core label signals are already inferred", () => {
    const deterministic = inferDeterministic(
      "USB-C to USB-C 240W cable with braided jacket"
    );

    const merged = mergeInferenceSignals({
      currentDraft: DEFAULT_MANUAL_DRAFT,
      deterministic,
      prompt: "USB-C to USB-C 240W cable with braided jacket",
    });

    expect(merged.status).toBe("ready");
    expect(merged.followUpQuestions.length).toBe(0);
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

  it("accepts flexible llm output shapes and normalizes them", () => {
    const llm = parseManualInferenceLlmOutput({
      confidence: "0.88",
      draftPatch: {
        connectorFrom: "type-c",
        connectorTo: "lightening",
        usbGeneration: " usb4 ",
        watts: 240,
      },
      notes: 12_345,
      uncertainties: ["Display", "charging"],
      extra: "ignored",
    });

    expect(llm.confidence).toBe(0.88);
    expect(llm.draftPatch.connectorFrom).toBe("USB-C");
    expect(llm.draftPatch.connectorTo).toBe("Lightning");
    expect(llm.draftPatch.watts).toBe("240");
    expect(llm.uncertainties).toEqual(["video", "power"]);
    expect(llm.notes).toBe("12345");
  });
});

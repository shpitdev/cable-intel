import { afterEach, describe, expect, it } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

const MODULE_FILE_REGEX = /\.[cm]?[jt]sx?$/;
const DECLARATION_FILE_SUFFIX = ".d.ts";

const modules = (() => {
  const loaders: Record<string, () => Promise<unknown>> = {};

  const collectModulePaths = (directory: string, prefix = ""): string[] => {
    const entries = readdirSync(directory, {
      withFileTypes: true,
    });
    const modulePaths: string[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        modulePaths.push(
          ...collectModulePaths(
            join(directory, entry.name),
            `${prefix}${entry.name}/`
          )
        );
      } else if (
        entry.name.match(MODULE_FILE_REGEX) &&
        !entry.name.endsWith(DECLARATION_FILE_SUFFIX)
      ) {
        modulePaths.push(`${prefix}${entry.name}`);
      }
    }

    return modulePaths;
  };

  for (const filePath of collectModulePaths(import.meta.dir)) {
    if (filePath.endsWith(".test.ts")) {
      continue;
    }
    loaders[`./${filePath}`] = async () => import(`./${filePath}`);
  }

  return loaders;
})();

const ORIGINAL_AI_GATEWAY_API_KEY = process.env.AI_GATEWAY_API_KEY;

afterEach(() => {
  if (ORIGINAL_AI_GATEWAY_API_KEY === undefined) {
    process.env.AI_GATEWAY_API_KEY = undefined;
  } else {
    process.env.AI_GATEWAY_API_KEY = ORIGINAL_AI_GATEWAY_API_KEY;
  }
});

describe("manualInference", () => {
  it("creates a default session and allows direct draft patching", async () => {
    const t = convexTest(schema, modules);

    const ensured = await t.mutation(api.manualInference.ensureSession, {
      workspaceId: "workspace-one",
    });

    expect(ensured.status).toBe("idle");
    expect(ensured.draft.connectorFrom).toBe("USB-C");

    await t.mutation(api.manualInference.patchDraft, {
      workspaceId: "workspace-one",
      patch: {
        gbps: "10",
        usbGeneration: "USB 3.2 Gen 2",
      },
    });

    const session = await t.query(api.manualInference.getSession, {
      workspaceId: "workspace-one",
    });

    expect(session?.draft.gbps).toBe("10");
    expect(session?.draft.usbGeneration).toBe("USB 3.2 Gen 2");
  });

  it("submits free-text prompt and pre-populates draft fields", async () => {
    process.env.AI_GATEWAY_API_KEY = undefined;
    const t = convexTest(schema, modules);

    const result = await t.action(api.manualInference.submitPrompt, {
      workspaceId: "workspace-two",
      prompt: "USB-C to USB-C cable, 240W, USB4, 8K 60Hz",
    });

    expect(result?.draft.connectorFrom).toBe("USB-C");
    expect(result?.draft.connectorTo).toBe("USB-C");
    expect(result?.draft.watts).toBe("240");
    expect(result?.draft.usbGeneration.length).toBeGreaterThan(0);
    expect(result?.draft.videoSupport).toBe("yes");
    expect(result?.status).toBe("ready");
    expect(result?.followUpQuestions.length).toBeLessThanOrEqual(1);
  });

  it("runs a follow-up question loop and applies answer patches", async () => {
    process.env.AI_GATEWAY_API_KEY = undefined;
    const t = convexTest(schema, modules);

    const inference = await t.action(api.manualInference.submitPrompt, {
      workspaceId: "workspace-three",
      prompt: "braided cable for laptop dock",
    });

    expect(inference?.status).toBe("needs_followup");
    const pending = inference?.followUpQuestions.filter((question) => {
      return question.status === "pending";
    });
    expect((pending?.length ?? 0) > 0).toBe(true);
    expect((pending?.length ?? 0) <= 1).toBe(true);

    const firstQuestion = pending?.[0];
    expect(firstQuestion).toBeDefined();
    if (!firstQuestion) {
      return;
    }

    await t.mutation(api.manualInference.answerQuestion, {
      workspaceId: "workspace-three",
      questionId: firstQuestion.id,
      answer: "yes",
    });

    const sessionAfterAnswer = await t.query(api.manualInference.getSession, {
      workspaceId: "workspace-three",
    });

    const answered = sessionAfterAnswer?.followUpQuestions.find((question) => {
      return question.id === firstQuestion.id;
    });
    expect(answered?.status).toBe("answered");

    if (firstQuestion.category === "power") {
      expect(sessionAfterAnswer?.draft.watts.length).toBeGreaterThan(0);
    }
    if (firstQuestion.category === "video") {
      expect(sessionAfterAnswer?.draft.videoSupport).toBe("yes");
    }
  });
});

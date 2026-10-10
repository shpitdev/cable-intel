import { expect, spyOn, test } from "bun:test";
import { createGatewayModel } from "./gatewayModel";

test("passes the validated Convex credential to the gateway request", async () => {
  const authorization: (string | null)[] = [];
  const request = spyOn(globalThis, "fetch").mockImplementation(
    (_url, init) => {
      authorization.push(new Headers(init?.headers).get("authorization"));
      return Promise.resolve(
        new Response(
          JSON.stringify({ error: { message: "test request rejected" } }),
          {
            status: 400,
            headers: { "content-type": "application/json" },
          }
        )
      );
    }
  );
  try {
    const model = createGatewayModel({
      aiGatewayApiKey: "test-convex-credential",
      model: "openai/gpt-oss-120b",
    });
    await expect(model.doGenerate({ prompt: [] })).rejects.toThrow();
    expect(authorization).toEqual(["Bearer test-convex-credential"]);
  } finally {
    request.mockRestore();
  }
});

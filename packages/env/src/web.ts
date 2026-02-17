import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  clientPrefix: "PUBLIC_",
  client: {
    PUBLIC_CONVEX_URL: z.url(),
  },
  // biome-ignore lint/suspicious/noExplicitAny: import.meta.env typing
  runtimeEnv: (import.meta as any).env,
  emptyStringAsUndefined: true,
});

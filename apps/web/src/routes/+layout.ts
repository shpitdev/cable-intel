import { injectAnalytics } from "@vercel/analytics/sveltekit";
import { dev } from "$app/environment";
import { env } from "$env/dynamic/public";

const analyticsDsn = env.PUBLIC_VERCEL_ANALYTICS_DSN?.trim();

injectAnalytics({
  mode: dev ? "development" : "production",
  ...(analyticsDsn
    ? {
        dsn: analyticsDsn,
        scriptSrc: dev
          ? "https://va.vercel-scripts.com/v1/script.debug.js"
          : "https://va.vercel-scripts.com/v1/script.js",
      }
    : {}),
});

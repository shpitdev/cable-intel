/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as catalogQuality from "../catalogQuality.js";
import type * as config from "../config.js";
import type * as contracts_extraction from "../contracts/extraction.js";
import type * as healthcheck from "../healthcheck.js";
import type * as ingest from "../ingest.js";
import type * as ingestDb from "../ingestDb.js";
import type * as ingestQueries from "../ingestQueries.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  catalogQuality: typeof catalogQuality;
  config: typeof config;
  "contracts/extraction": typeof contracts_extraction;
  healthcheck: typeof healthcheck;
  ingest: typeof ingest;
  ingestDb: typeof ingestDb;
  ingestQueries: typeof ingestQueries;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};

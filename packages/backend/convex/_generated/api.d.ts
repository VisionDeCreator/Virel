/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as adminLimits from "../adminLimits.js";
import type * as auth from "../auth.js";
import type * as authEmail from "../authEmail.js";
import type * as authOtp from "../authOtp.js";
import type * as creditPricing from "../creditPricing.js";
import type * as credits from "../credits.js";
import type * as crons from "../crons.js";
import type * as feed from "../feed.js";
import type * as generation from "../generation.js";
import type * as generationActions from "../generationActions.js";
import type * as http from "../http.js";
import type * as media from "../media.js";
import type * as mediaCleanup from "../mediaCleanup.js";
import type * as profiles from "../profiles.js";
import type * as serviceAuth from "../serviceAuth.js";
import type * as studioAccess from "../studioAccess.js";
import type * as studioScripts from "../studioScripts.js";
import type * as studioValidators from "../studioValidators.js";
import type * as tasks from "../tasks.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  adminLimits: typeof adminLimits;
  auth: typeof auth;
  authEmail: typeof authEmail;
  authOtp: typeof authOtp;
  creditPricing: typeof creditPricing;
  credits: typeof credits;
  crons: typeof crons;
  feed: typeof feed;
  generation: typeof generation;
  generationActions: typeof generationActions;
  http: typeof http;
  media: typeof media;
  mediaCleanup: typeof mediaCleanup;
  profiles: typeof profiles;
  serviceAuth: typeof serviceAuth;
  studioAccess: typeof studioAccess;
  studioScripts: typeof studioScripts;
  studioValidators: typeof studioValidators;
  tasks: typeof tasks;
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

export declare const components: {
  workpool: import("@convex-dev/workpool/_generated/component.js").ComponentApi<"workpool">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};

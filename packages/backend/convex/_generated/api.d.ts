import type * as auth from "../auth.js";
import type * as feed from "../feed.js";
import type * as profiles from "../profiles.js";
import type { ApiFromModules, FilterApi, FunctionReference } from "convex/server";
declare const fullApi: ApiFromModules<{ auth: typeof auth; feed: typeof feed; profiles: typeof profiles }>;
export declare const api: FilterApi<typeof fullApi, FunctionReference<any, "public">>;
export declare const internal: FilterApi<typeof fullApi, FunctionReference<any, "internal">>;

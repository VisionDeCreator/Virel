import { queryGeneric, mutationGeneric, internalMutationGeneric } from "convex/server";
import type { QueryBuilder, MutationBuilder } from "convex/server";
import type { DataModel } from "./dataModel";
export const query: QueryBuilder<DataModel, "public"> = queryGeneric;
export const mutation: MutationBuilder<DataModel, "public"> = mutationGeneric;
export const internalMutation: MutationBuilder<DataModel, "internal"> = internalMutationGeneric;

import type { ObjectType, PropertyValidators } from "convex/values";
import type { ActionCtx } from "../../../../packages/backend/convex/_generated/server";
export type ServiceContext = Pick<ActionCtx, "runQuery" | "runMutation">;
function defineService<Fields extends PropertyValidators, Result>(definition: {
  args: Fields;
  handler: (ctx: ServiceContext, args: ObjectType<Fields>) => Promise<Result>;
}) {
  return definition;
}
export const action = defineService;
export const internalAction = defineService;

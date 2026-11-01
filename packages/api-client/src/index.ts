export { api } from "@virel/backend";
export {
  useQuery,
  useMutation,
  useAction,
  usePaginatedQuery,
  useConvexAuth,
} from "convex/react";
export { useAuthActions, useAuthToken } from "@convex-dev/auth/react";

export type { Id, Doc } from "@virel/backend";
export { useStudio } from "./studio";
export { useEmailSignIn } from "./email-otp";

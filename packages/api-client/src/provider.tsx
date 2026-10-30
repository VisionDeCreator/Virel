import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import type { ComponentProps } from "react";
export { ConvexReactClient };
export function BackendProvider(
  props: ComponentProps<typeof ConvexAuthProvider>,
) {
  return <ConvexAuthProvider {...props} />;
}

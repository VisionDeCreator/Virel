import { ApiProvider } from "./http";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import type { ComponentProps } from "react";
export { ConvexReactClient };
export function BackendProvider(
  props: ComponentProps<typeof ConvexAuthProvider> & { apiUrl?: string },
) {
  const { apiUrl = "", children, ...auth } = props;
  return (
    <ConvexAuthProvider {...auth}>
      <ApiProvider url={apiUrl}>{children}</ApiProvider>
    </ConvexAuthProvider>
  );
}

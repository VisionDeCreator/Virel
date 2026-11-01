import { useSearchParams, NavLink } from "react-router-dom";
import { useConvexAuth } from "@virel/api-client";
import { Notice } from "@virel/ui";
import { StudioPreview } from "./StudioPreview";
import { CreationLibraryPreview, CreationWorkspace } from "./CreationWorkspace";
export function Studio({ connected }: { connected: boolean }) {
  const [params] = useSearchParams();
  return connected ? (
    <ConnectedStudio />
  ) : params.get("view") === "new" ? (
    <>
      <NavLink className="button button--ghost" to="/create">
        ← Your creations
      </NavLink>
      <StudioPreview connected={false} />
    </>
  ) : (
    <CreationLibraryPreview />
  );
}
function ConnectedStudio() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  if (isLoading) return <p role="status">Opening Studio…</p>;
  if (!isAuthenticated)
    return (
      <div className="studio-page">
        <h1>
          Make something <em>worth remixing.</em>
        </h1>
        <Notice>
          <NavLink to="/profile">Sign in or create an account</NavLink> to
          upload, generate, and publish videos.
        </Notice>
      </div>
    );
  return <CreationWorkspace />;
}

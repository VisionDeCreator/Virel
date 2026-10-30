import { createRoot } from "react-dom/client";
import { EmptyState } from "@virel/ui";
import "@virel/design-tokens/styles.css";
import "./styles.css";
createRoot(document.getElementById("root")!).render(
  <main>
    <h1>virel / admin</h1>
    <EmptyState title="Operations foundation">
      Moderation and financial administration will appear here after server-side
      role checks are implemented. No privileged data is exposed.
    </EmptyState>
  </main>,
);

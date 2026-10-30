import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { BackendProvider, ConvexReactClient } from "@virel/api-client/provider";
import { App } from "./app/App";
import { ErrorBoundary } from "./app/ErrorBoundary";
import "./styles.css";
const url = import.meta.env.VITE_CONVEX_URL;
const client = url ? new ConvexReactClient(url) : null;
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        {client ? (
          <BackendProvider client={client}>
            <App connected />
          </BackendProvider>
        ) : (
          <App connected={false} />
        )}
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);

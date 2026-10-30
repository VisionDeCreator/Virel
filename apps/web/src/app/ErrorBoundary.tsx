import { Component, type ReactNode } from "react";
import { Button, EmptyState } from "@virel/ui";

export class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) {
      return (
        <EmptyState title="We couldn't load Virel.">
          Check your connection and backend configuration, then try again.
          <br />
          <Button onClick={() => window.location.reload()}>Reload</Button>
        </EmptyState>
      );
    }
    return this.props.children;
  }
}

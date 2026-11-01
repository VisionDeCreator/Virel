import { useEffect, useState, useRef } from "react";
import {
  useQuery,
  useMutation,
  usePaginatedQuery,
  useConvexAuth,
} from "convex/react";
import { api } from "@virel/backend";
export function useRewards() {
  const { isAuthenticated } = useConvexAuth();
  const balance = useQuery(api.rewards.balance, isAuthenticated ? {} : "skip");
  const initialize = useMutation(api.rewards.initialize);
  const setHidden = useMutation(api.rewards.setHidden).withOptimisticUpdate(
    (store, args) => {
      if (!args.hidden) return; // Revealing waits for an authenticated server response.
      const current = store.getQuery(api.rewards.balance, {});
      if (current)
        store.setQuery(
          api.rewards.balance,
          {},
          {
            ...current,
            hidden: true,
            pendingUsdMicros: null,
            availableUsdMicros: null,
            earnedUsdMicros: null,
          },
        );
      for (const q of store.getAllQueries(api.rewards.history))
        if (q.value)
          store.setQuery(api.rewards.history, q.args, {
            ...q.value,
            page: q.value.page.map((e) => ({ ...e, usdMicros: null })),
          });
    },
  );
  const history = usePaginatedQuery(
    api.rewards.history,
    isAuthenticated ? {} : "skip",
    { initialNumItems: 10 },
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const failed = useRef<{
    run: () => Promise<unknown>;
    message: string;
  } | null>(null);
  useEffect(() => {
    if (isAuthenticated)
      void initialize().catch(() => {
        const message = "Unable to load your reward history. Please try again.";
        failed.current = { run: () => initialize(), message };
        setError(message);
      });
  }, [isAuthenticated, initialize]);
  async function toggleHidden() {
    if (!balance || busy) return;
    setBusy(true);
    setError("");
    const action = () => setHidden({ hidden: !balance.hidden });
    try {
      await action();
      failed.current = null;
    } catch {
      const message = "Unable to save balance visibility. Please try again.";
      failed.current = { run: action, message };
      setError(message);
    } finally {
      setBusy(false);
    }
  }
  async function retry() {
    setBusy(true);
    setError("");
    const action = failed.current ?? {
      run: () => initialize(),
      message: "Unable to load your reward history. Please try again.",
    };
    try {
      await action.run();
      failed.current = null;
    } catch {
      failed.current = action;
      setError(action.message);
    } finally {
      setBusy(false);
    }
  }
  return { balance, history, error, busy, toggleHidden, retry };
}

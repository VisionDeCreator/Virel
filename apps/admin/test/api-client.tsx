// Browser-only fixture, loaded exclusively by vite.test.config.ts.
import { useState, useSyncExternalStore } from "react";
const listeners = new Set<() => void>();
let revision = 0;
const scenario = new URLSearchParams(location.search).get("scenario");
let authenticated = scenario !== "login";
let balance = 20;
let failOnce = scenario === "lost-response";
const requests = new Map<string, number>();
const ledger: {
  _id: string;
  kind: string;
  amount: number;
  note: string;
  _creationTime: number;
}[] = [];
function notify() {
  revision++;
  for (const listener of listeners) listener();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function useRevision() {
  useSyncExternalStore(subscribe, () => revision);
}
export const api = {
  admin: {
    me: "me",
    lookupUser: "lookup",
    grantCredits: "grant",
    creditHistory: "history",
    audit: "audit",
  },
};
export function useConvexAuth() {
  useRevision();
  return { isAuthenticated: authenticated, isLoading: false };
}
export function useAuthActions() {
  return {
    signIn: async () => {
      authenticated = true;
      notify();
      return { signingIn: true };
    },
    signOut: async () => {
      authenticated = false;
      notify();
    },
  };
}
export function useQuery(name: string, args?: { email?: string } | "skip") {
  useRevision();
  if (name === "me")
    return scenario === "denied"
      ? null
      : { email: "admin@example.com", role: "platform_admin" };
  if (args === "skip") return undefined;
  if (typeof args === "object" && args.email === "missing@example.com")
    return null;
  return {
    userId: "test-user",
    email: "creator@example.com",
    name: "Test creator",
    available: balance,
    reserved: 5,
    jobs: [],
  };
}
export function useMutation() {
  return async (args: {
    amount: number;
    reason: string;
    requestId: string;
  }) => {
    if (!requests.has(args.requestId)) {
      balance += args.amount;
      requests.set(args.requestId, balance);
      ledger.unshift({
        _id: args.requestId,
        kind: "grant",
        amount: args.amount,
        note: args.reason,
        _creationTime: Date.now(),
      });
      notify();
    }
    if (failOnce) {
      failOnce = false;
      throw new Error("Connection lost after commit");
    }
    return {
      balance: requests.get(args.requestId),
      duplicate: requests.size === 1 && scenario === "lost-response",
    };
  };
}
export function usePaginatedQuery(name: string) {
  useRevision();
  return {
    results: name === "history" ? ledger : [],
    status: "Exhausted",
    loadMore() {},
  };
}

export function useEmailSignIn() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState<{ email: string } | null>(null);
  const [error, setError] = useState("");
  return {
    email,
    setEmail,
    code,
    setCode,
    challenge,
    busy: false,
    error,
    wait: 0,
    expired: false,
    request: async () => {
      setChallenge({ email });
    },
    verify: async () => {
      if (code !== "001234") {
        setError(
          "Code is incorrect or expired. Check your code or request a new one.",
        );
        return;
      }
      authenticated = true;
      notify();
    },
    changeEmail: () => {
      setChallenge(null);
      setError("");
    },
  };
}

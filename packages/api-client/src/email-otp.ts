import { useEffect, useState } from "react";
import { useAuthActions } from "./auth-actions";
import { useApiUrl } from "./http";
export type EmailChallenge = {
  email: string;
  challenge: string;
  expiresAt: number;
  resendAt: number;
};
export class EmailRequestError extends Error {
  constructor(
    message: string,
    public retryAfterSeconds = 0,
  ) {
    super(message);
  }
}
export async function requestEmailCode(
  base: string,
  email: string,
): Promise<EmailChallenge> {
  if (!base) throw new Error("Sign-in API is not configured.");
  const response = await fetch(
    `${base.replace(/\/$/, "")}/auth/email/request`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    },
  );
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new EmailRequestError(
      typeof body?.message === "string"
        ? body.message
        : "Unable to send a code. Try again.",
      Number(body?.retryAfterSeconds) || 0,
    );
  if (!validChallenge(body))
    throw new Error("The sign-in service returned an invalid response.");
  return body;
}
function validChallenge(value: unknown): value is EmailChallenge {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<EmailChallenge>;
  return (
    typeof item.email === "string" &&
    /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(item.email) &&
    typeof item.challenge === "string" &&
    /^[a-f0-9]{64}$/.test(item.challenge) &&
    typeof item.expiresAt === "number" &&
    Number.isFinite(item.expiresAt) &&
    typeof item.resendAt === "number" &&
    Number.isFinite(item.resendAt)
  );
}
const key = "virel:email-otp";
function browserStorage(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}
export function restoreChallenge(): EmailChallenge | null {
  try {
    const value: unknown = JSON.parse(browserStorage()?.getItem(key) ?? "null");
    return validChallenge(value) && value.expiresAt > Date.now() ? value : null;
  } catch {
    return null;
  }
}
function persistChallenge(challenge: EmailChallenge | null) {
  try {
    if (challenge) browserStorage()?.setItem(key, JSON.stringify(challenge));
    else browserStorage()?.removeItem(key);
  } catch {
    /* Storage may be unavailable; keep the challenge in memory. */
  }
}
export function useEmailSignIn() {
  const base = useApiUrl();
  const { signIn } = useAuthActions();
  const [challenge, setChallenge] = useState<EmailChallenge | null>(
    restoreChallenge,
  );
  const [email, setEmail] = useState(challenge?.email ?? "");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now);
  const [retryAt, setRetryAt] = useState(challenge?.resendAt ?? 0);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const wait = Math.max(0, Math.ceil((retryAt - now) / 1000));
  const expired = !!challenge && challenge.expiresAt <= now;
  async function request() {
    if (busy || wait) return;
    setBusy(true);
    setError("");
    try {
      const next = await requestEmailCode(base, challenge?.email ?? email);
      setChallenge(next);
      persistChallenge(next);
      setRetryAt(next.resendAt);
      setCode("");
      setNow(Date.now());
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to send a code. Try again.",
      );
      if (err instanceof EmailRequestError)
        setRetryAt(Date.now() + err.retryAfterSeconds * 1000);
    } finally {
      setBusy(false);
    }
  }
  async function verify() {
    if (busy || !challenge || expired || !/^\d{6}$/.test(code)) return;
    setBusy(true);
    setError("");
    try {
      const result = await signIn("email-otp", {
        email: challenge.email,
        challenge: challenge.challenge,
        code,
      });
      if (!result.signingIn) throw new Error("Sign-in did not complete.");
      persistChallenge(null);
      setChallenge(null);
      setCode("");
    } catch {
      setError(
        "Code is incorrect or expired. Check your code or request a new one.",
      );
    } finally {
      setBusy(false);
    }
  }
  function changeEmail() {
    if (busy) return;
    setChallenge(null);
    persistChallenge(null);
    setCode("");
    setError(""); /* Keep the cooldown when changing the address. */
  }
  return {
    email,
    setEmail,
    code,
    setCode,
    challenge,
    busy,
    error,
    wait,
    expired,
    request,
    verify,
    changeEmail,
  };
}

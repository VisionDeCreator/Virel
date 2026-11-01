import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  requestEmailCode,
  restoreChallenge,
  useEmailSignIn,
} from "../../../packages/api-client/src/email-otp";
const state = vi.hoisted(() => ({ signIn: vi.fn() }));
vi.mock("../../../packages/api-client/src/auth-actions", () => ({
  useAuthActions: () => ({ signIn: state.signIn }),
}));
vi.mock("../../../packages/api-client/src/http", () => ({
  useApiUrl: () => "http://localhost:3101",
}));
const challenge = () => ({
  email: "creator@example.com",
  challenge: "a".repeat(64),
  expiresAt: Date.now() + 600_000,
  resendAt: Date.now() + 60_000,
});
beforeEach(() => {
  sessionStorage.clear();
  state.signIn.mockReset();
  state.signIn.mockResolvedValue({ signingIn: true });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(challenge())),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
test("requests from the API, restores the challenge and sends the six-digit code without losing leading zeros", async () => {
  const hook = renderHook(useEmailSignIn);
  act(() => hook.result.current.setEmail(" Creator@Example.com "));
  await act(() => hook.result.current.request());
  expect(fetch).toHaveBeenCalledWith(
    "http://localhost:3101/auth/email/request",
    expect.objectContaining({ body: '{"email":"creator@example.com"}' }),
  );
  expect(hook.result.current.wait).toBeGreaterThan(0);
  expect(restoreChallenge()?.challenge).toBe("a".repeat(64));
  hook.unmount();
  const restored = renderHook(useEmailSignIn);
  expect(restored.result.current.challenge?.email).toBe("creator@example.com");
  act(() => restored.result.current.setCode("001234"));
  await act(() => restored.result.current.verify());
  expect(state.signIn).toHaveBeenCalledWith("email-otp", {
    email: "creator@example.com",
    challenge: "a".repeat(64),
    code: "001234",
  });
  expect(restoreChallenge()).toBeNull();
});
test("failed verification keeps the challenge available for a retry", async () => {
  state.signIn.mockRejectedValue(new Error("Invalid code"));
  const hook = renderHook(useEmailSignIn);
  act(() => hook.result.current.setEmail("creator@example.com"));
  await act(() => hook.result.current.request());
  act(() => hook.result.current.setCode("001234"));
  await act(() => hook.result.current.verify());
  expect(hook.result.current.error).toContain("incorrect or expired");
  expect(restoreChallenge()).not.toBeNull();
});
test("expired challenges are not restored and malformed service responses are rejected", async () => {
  sessionStorage.setItem(
    "virel:email-otp",
    JSON.stringify({ ...challenge(), expiresAt: Date.now() - 1 }),
  );
  expect(restoreChallenge()).toBeNull();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ challenge: "malformed" })),
  );
  await expect(
    requestEmailCode("http://localhost:3101", "creator@example.com"),
  ).rejects.toThrow("invalid response");
});
test("resend waits for the cooldown and expired codes cannot be submitted", async () => {
  vi.useFakeTimers();
  const hook = renderHook(useEmailSignIn);
  act(() => hook.result.current.setEmail("creator@example.com"));
  await act(() => hook.result.current.request());
  await act(() => hook.result.current.request());
  expect(fetch).toHaveBeenCalledTimes(1);
  act(() => vi.advanceTimersByTime(601_000));
  expect(hook.result.current.expired).toBe(true);
  act(() => hook.result.current.setCode("001234"));
  await act(() => hook.result.current.verify());
  expect(state.signIn).not.toHaveBeenCalled();
  await act(() => hook.result.current.request());
  expect(fetch).toHaveBeenCalledTimes(2);
});

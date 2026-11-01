import { afterEach, beforeEach, expect, test, vi } from "vitest";
import nodemailer from "nodemailer";
import { smtpConfiguration, sendSmtpEmail } from "./smtp";

vi.mock("nodemailer", () => ({ default: { createTransport: vi.fn() } }));
const sendMail = vi.fn();
const close = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  for (const [name, value] of Object.entries({
    EMAIL_NOTIFICATIONS_ENABLED: "true",
    SMTP_HOST: "smtp.example.com",
    SMTP_PORT: "465",
    SMTP_SECURE: "true",
    SMTP_USER: "fixture",
    SMTP_PASSWORD: "fixture-password",
    SMTP_FROM_NAME: "Virel",
    SMTP_FROM_EMAIL: "verify@example.com",
    SMTP_REPLY_TO: "help@example.com",
  }))
    vi.stubEnv(name, value);
  sendMail.mockResolvedValue({
    accepted: ["creator@example.com"],
    rejected: [],
  });
  vi.mocked(nodemailer.createTransport).mockReturnValue({
    sendMail,
    close,
  } as never);
});
afterEach(() => vi.unstubAllEnvs());
const args = {
  to: "creator@example.com",
  subject: "Verify",
  text: "Code",
  idempotencyKey: "verification-1",
};
test("disabled SMTP creates no transport", async () => {
  vi.stubEnv("EMAIL_NOTIFICATIONS_ENABLED", "false");
  expect(await sendSmtpEmail(args)).toEqual({ sent: false });
  expect(nodemailer.createTransport).not.toHaveBeenCalled();
});
test("SMTP uses configured TLS, sender, reply-to, timeouts and deterministic message IDs", async () => {
  expect(await sendSmtpEmail(args)).toEqual({ sent: true });
  expect(nodemailer.createTransport).toHaveBeenCalledWith(
    expect.objectContaining({
      host: "smtp.example.com",
      port: 465,
      secure: true,
      disableFileAccess: true,
      disableUrlAccess: true,
    }),
  );
  expect(sendMail).toHaveBeenCalledWith(
    expect.objectContaining({
      from: { name: "Virel", address: "verify@example.com" },
      replyTo: "help@example.com",
      messageId: expect.stringMatching(/^<[a-f0-9]{64}@example.com>$/),
    }),
  );
  expect(close).toHaveBeenCalledOnce();
  vi.stubEnv("SMTP_SECURE", "false");
  vi.stubEnv("SMTP_PORT", "587");
  expect(smtpConfiguration()?.transport).toMatchObject({
    secure: false,
    requireTLS: true,
    port: 587,
  });
});
test("configuration is validated and transport failures are sanitized and closed", async () => {
  vi.stubEnv("SMTP_PORT", "invalid");
  expect(() => smtpConfiguration()).toThrow("Invalid SMTP_PORT");
  vi.stubEnv("SMTP_PORT", "465");
  vi.stubEnv("SMTP_PASSWORD", "");
  expect(() => smtpConfiguration()).toThrow("not configured");
  vi.stubEnv("SMTP_PASSWORD", "fixture-password");
  sendMail.mockRejectedValue(new Error("fixture-password server detail"));
  await expect(sendSmtpEmail(args)).rejects.toThrow("SMTP delivery failed");
  expect(close).toHaveBeenCalledOnce();
});

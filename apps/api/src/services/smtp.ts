import { createHash } from "node:crypto";
import nodemailer from "nodemailer";

export function smtpConfiguration() {
  if (process.env.EMAIL_NOTIFICATIONS_ENABLED !== "true") return null;
  const read = (name: string) => process.env[name]?.trim() ?? "";
  for (const name of [
    "SMTP_HOST",
    "SMTP_USER",
    "SMTP_PASSWORD",
    "SMTP_FROM_EMAIL",
  ])
    if (!read(name)) throw new Error("SMTP email is not configured.");
  const secure = read("SMTP_SECURE") || "true";
  const port = Number(read("SMTP_PORT") || (secure === "true" ? 465 : 587));
  if (
    !["true", "false"].includes(secure) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  )
    throw new Error("Invalid SMTP_PORT or SMTP_SECURE configuration.");
  const address = read("SMTP_FROM_EMAIL");
  const replyTo = read("SMTP_REPLY_TO") || undefined;
  const validEmail = (value: string) =>
    value.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value);
  if (!validEmail(address) || (replyTo && !validEmail(replyTo)))
    throw new Error("Invalid SMTP sender configuration.");
  return {
    transport: {
      host: read("SMTP_HOST"),
      port,
      secure: secure === "true",
      requireTLS: secure !== "true",
      auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASSWORD! },
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 30_000,
      disableFileAccess: true,
      disableUrlAccess: true,
    },
    from: { name: read("SMTP_FROM_NAME") || "Virel", address },
    replyTo,
  };
}
export async function sendSmtpEmail(args: {
  to: string;
  subject: string;
  text: string;
  idempotencyKey: string;
}) {
  const configuration = smtpConfiguration();
  if (!configuration) return { sent: false as const };
  const transport = nodemailer.createTransport(configuration.transport);
  try {
    const result = await transport.sendMail({
      from: configuration.from,
      replyTo: configuration.replyTo,
      to: { name: "", address: args.to },
      subject: args.subject,
      text: args.text,
      messageId: `<${createHash("sha256").update(args.idempotencyKey).digest("hex")}@${configuration.from.address.split("@")[1]}>`,
    });
    if (!result.accepted?.length || result.rejected?.length)
      throw new Error("Recipient rejected");
    return { sent: true as const };
  } catch {
    throw new Error(
      "SMTP delivery failed. Check sender configuration and email service availability.",
    );
  } finally {
    transport.close();
  }
}

// Local live-test harness only. Production entrypoints never import this module.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import nodemailer from "nodemailer";
import { loadRootEnvironment } from "../src/runtime/env";
import { createApp } from "../src/app";
loadRootEnvironment();
const configuration = readFileSync(
  fileURLToPath(
    new URL("../../../packages/backend/.env.local", import.meta.url),
  ),
  "utf8",
);
const configuredUrl = configuration
  .match(/^(?:VITE_)?CONVEX_URL=(.+)$/m)?.[1]
  ?.trim();
if (
  !/^CONVEX_DEPLOYMENT=dev:/m.test(configuration) ||
  configuredUrl !== process.env.CONVEX_URL
)
  throw new Error(
    "Live email tests require the matching Virel development deployment.",
  );
const mail = new Map<string, string>();
Object.assign(process.env, {
  EMAIL_NOTIFICATIONS_ENABLED: "true",
  SMTP_HOST: "smtp.test.invalid",
  SMTP_USER: "fixture",
  SMTP_PASSWORD: "fixture",
  SMTP_FROM_EMAIL: "verify@example.invalid",
  SMTP_SECURE: "true",
  SMTP_PORT: "465",
});
nodemailer.createTransport = (() => ({
  sendMail: async (options: { to: { address: string }; text: string }) => {
    const email = options.to.address;
    if (!/^virel-e2e-[a-z0-9]+@example\.invalid$/.test(email))
      throw new Error("Only labeled fixture recipients are allowed");
    const code = options.text.match(/code is (\d{6})/)?.[1];
    if (!code) throw new Error("Missing fixture code");
    mail.set(email, code);
    return { accepted: [email], rejected: [] };
  },
  close() {},
})) as unknown as typeof nodemailer.createTransport;
const app = createApp({
  convexUrl: process.env.CONVEX_URL,
  webOrigins: ["http://localhost:5190"],
});
app.get("/__test/email", ({ query }) => {
  const email = query.email ?? "";
  if (!/^virel-e2e-[a-z0-9]+@example\.invalid$/.test(email))
    return new Response(null, { status: 404 });
  return Response.json(
    { code: mail.get(email) ?? null },
    { headers: { "Cache-Control": "no-store" } },
  );
});
app.listen({ hostname: "127.0.0.1", port: Number(process.env.PORT ?? 3190) });

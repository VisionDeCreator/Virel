import { expect, test } from "vitest";
import { createApp } from "../src/app";
test("protected API rejects anonymous callers before backend access", async () => {
  const app = createApp();
  const response = await app.handle(new Request("http://localhost/v1/me"));
  expect(response.status).toBe(401);
});
test("health is live but protected access fails closed without backend configuration", async () => {
  const app = createApp();
  expect(
    (await app.handle(new Request("http://localhost/health"))).status,
  ).toBe(200);
  const response = await app.handle(
    new Request("http://localhost/v1/me", {
      headers: { authorization: "Bearer unverified" },
    }),
  );
  expect(response.status).toBe(503);
});

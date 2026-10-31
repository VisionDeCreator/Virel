import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("real signup, cross-session profile sync, API authorization, persistence and logout", async ({
  page,
  browser,
  request,
}) => {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 14);
  const email = `virel-e2e-${suffix}@example.invalid`;
  const password = `${randomUUID()}Aa9!`;
  const username = `e2e_${suffix}`;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/profile");
  await page
    .getByRole("button", { name: "New here? Create an account" })
    .click();
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Username", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Username", exact: true })
    .fill(username);
  await page
    .getByRole("textbox", { name: "Display name", exact: true })
    .fill("Virel Auth Test");
  await page
    .getByRole("textbox", { name: "Biography", exact: true })
    .fill("Automated development account");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Virel Auth Test", exact: true }),
  ).toBeVisible();

  const context = await browser.newContext();
  try {
    const second = await context.newPage();
    await second.goto("http://localhost:5190/profile");
    await second
      .getByRole("textbox", { name: "Email", exact: true })
      .fill(email);
    await second.getByLabel("Password", { exact: true }).fill(password);
    await second.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
      second.getByRole("heading", { name: "Virel Auth Test", exact: true }),
    ).toBeVisible();
    await second
      .getByRole("textbox", { name: "Display name", exact: true })
      .fill("Virel Synced Test");
    await second
      .getByRole("button", { name: "Save profile", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Virel Synced Test", exact: true }),
    ).toBeVisible();

    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Virel Synced Test", exact: true }),
    ).toBeVisible();
    const token = await page.evaluate(() => {
      const key = Object.keys(localStorage).find((key) =>
        key.startsWith("__convexAuthJWT"),
      );
      return key ? localStorage.getItem(key) : null;
    });
    if (!token) throw new Error("Session token was not persisted");
    const apiResponse = await request.get("http://127.0.0.1:3190/v1/me", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(apiResponse.status()).toBe(200);
    expect((await apiResponse.json()).profile.username).toBe(username);
    const anonymous = await request.get("http://127.0.0.1:3190/v1/me");
    expect(anonymous.status()).toBe(401);
    const invalid = await request.get("http://127.0.0.1:3190/v1/me", {
      headers: { authorization: "Bearer invalid-token" },
    });
    expect(invalid.status()).toBe(401);

    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Welcome back.", exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Welcome back.", exact: true }),
    ).toBeVisible();
    await expect(
      second.getByRole("heading", { name: "Virel Synced Test", exact: true }),
    ).toBeVisible();
    await second.getByRole("button", { name: "Sign out", exact: true }).click();
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

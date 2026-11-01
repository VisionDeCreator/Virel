import { expect, test } from "@playwright/test";
test("sign in and access-denied states are usable", async ({ page }) => {
  await page.goto("/?scenario=login");
  await expect(
    page.getByRole("heading", { name: "Administrator sign in" }),
  ).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill("admin@example.com");
  await page
    .getByRole("button", { name: "Send sign-in code", exact: true })
    .click();
  await page.getByLabel("Verification code").fill("001234");
  await page
    .getByRole("button", { name: "Verify & sign in", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Find a user" }),
  ).toBeVisible();
  await page.goto("/?scenario=denied");
  await expect(
    page.getByText("This account does not have verified administrator access."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Users & credits" }),
  ).toHaveCount(0);
});
test("lookup, recipient review, grant success and history", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill("missing@example.com");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(
    page.getByText("No existing account has this email."),
  ).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill("creator@example.com");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByLabel("Promotional credits").fill("100");
  await page.getByLabel("Reason").fill("Creator onboarding");
  await page.getByRole("button", { name: "Review grant" }).click();
  await expect(page.getByText("Increase:")).toContainText(
    "100 promotional credits",
  );
  await page.screenshot({
    path: test.info().outputPath("grant-review.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Confirm grant" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Balance after this grant: 120",
  );
  await expect(
    page.getByText("Credits added: 100", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Audit history", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Audit history" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("lost response retries the original grant without adding credits twice", async ({
  page,
}) => {
  await page.goto("/?scenario=lost-response");
  await page.getByLabel("Email", { exact: true }).fill("creator@example.com");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByLabel("Promotional credits").fill("100");
  await page.getByLabel("Reason").fill("Creator onboarding");
  await page.getByRole("button", { name: "Review grant" }).click();
  await page.getByRole("button", { name: "Confirm grant" }).click();
  await expect(page.getByRole("alert")).toContainText("Retry the same grant");
  await page.getByRole("button", { name: "Retry same grant" }).click();
  await expect(page.getByRole("status")).toContainText("already recorded");
  await expect(page.locator(".balance")).toContainText("120 available");
});

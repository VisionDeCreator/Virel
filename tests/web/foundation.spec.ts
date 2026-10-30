import { expect, test } from "@playwright/test";

test("unconfigured foundation supports navigation without exposing sign-in or paid actions", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your next inspiration starts here." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Profile", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "One identity. Every screen." }),
  ).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await page.getByRole("link", { name: "Create", exact: true }).click();
  await expect(
    page.getByText("Generation and payments are not enabled.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /generate|purchase/i }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("public routes survive a direct load", async ({ page }) => {
  await page.goto("/profile");
  await expect(
    page.getByRole("heading", { name: "One identity. Every screen." }),
  ).toBeVisible();
  await page.goto("/missing");
  await expect(
    page.getByRole("heading", { name: "Page not found" }),
  ).toBeVisible();
});

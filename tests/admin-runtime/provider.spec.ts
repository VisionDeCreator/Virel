import { expect, test } from "@playwright/test";
test("real Convex auth provider renders without React hook errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (entry) => {
    if (
      entry.type() === "error" &&
      /Invalid hook call|Cannot read properties of null.*useMemo/.test(
        entry.text(),
      )
    )
      errors.push(entry.text());
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Administrator sign in" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Send sign-in code" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Administrator sign in" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

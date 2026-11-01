import { expect, test } from "@playwright/test";

test("representative screens remain usable without a configured backend", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Find your next what if." }),
  ).toBeVisible();
  await expect(page.getByText("STYLE STUDY · CONCEPT ARTWORK")).toBeVisible();
  await page.getByRole("link", { name: "Profile", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Make your mark." }),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Username" })).toBeDisabled();
  await page.getByRole("link", { name: "Create", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your creations" }),
  ).toBeVisible();
  await page.getByRole("link", { name: /Create a video/ }).click();
  await expect(
    page.getByRole("heading", { name: "Create a video" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create video", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("textbox", { name: "Script" })
    .fill("A cinematic desert scene");
  await page.getByLabel("Duration", { exact: true }).selectOption("10");
  await page.getByLabel("Aspect ratio", { exact: true }).selectOption("16:9");
  await expect(page.getByRole("textbox", { name: "Script" })).toHaveValue(
    "A cinematic desert scene",
  );
  await expect(page.getByText("Model: Seedance 2.5")).toBeVisible();
  await page
    .getByText("References · optional for Create", { exact: true })
    .click();
  await expect(
    page.getByText("Optional image references", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Choose a platform video" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Remix", exact: true }),
  ).toHaveCount(0);
  const button = page.getByRole("button", {
    name: "Create video",
    exact: true,
  });
  expect(
    await button.evaluate((el) => getComputedStyle(el).backgroundImage),
  ).toBe("none");
  expect(await button.evaluate((el) => getComputedStyle(el).boxShadow)).toBe(
    "none",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("representative routes support direct loads without horizontal overflow", async ({
  page,
}) => {
  for (const path of ["/", "/profile", "/create", "/settings?tab=credits"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.goto("/missing");
  await expect(
    page.getByRole("heading", { name: "Page not found" }),
  ).toBeVisible();
});

test("image input rejects unsupported files", async ({ page }) => {
  await page.goto("/create?view=new");
  await page
    .getByText("References · optional for Create", { exact: true })
    .click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "invalid.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not an image"),
  });
  await expect(page.getByRole("alert")).toHaveText(
    "Choose a JPG, PNG, or WebP image under 10 MB.",
  );
});

test("creation designs remain readable on desktop and mobile", async ({
  page,
}, testInfo) => {
  await page.goto("/create");
  await expect(
    page.getByRole("heading", { name: "Your creations" }),
  ).toBeVisible();
  await page.screenshot({
    path: `/tmp/virel-library-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("link", { name: /Create a video/ }).click();
  await expect(page.getByRole("textbox", { name: "Script" })).toBeVisible();
  await page.screenshot({
    path: `/tmp/virel-editor-${testInfo.project.name}.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

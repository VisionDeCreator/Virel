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
    page.getByRole("heading", { name: "Make something worth remixing." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create video", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("textbox", { name: "Your prompt" })
    .fill("A cinematic desert scene");
  await page.getByLabel("Duration", { exact: true }).selectOption("10");
  await page.getByLabel("Aspect ratio", { exact: true }).selectOption("16:9");
  await expect(page.getByRole("textbox", { name: "Your prompt" })).toHaveValue(
    "A cinematic desert scene",
  );
  await page
    .getByRole("button", { name: "Image to video", exact: true })
    .click();
  await expect(page.getByLabel("Choose your starting image")).toBeVisible();
  await page.getByRole("button", { name: "Remix", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "What would you change?" }),
  ).toHaveValue("A cinematic desert scene");
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
  for (const path of ["/", "/profile", "/create"]) {
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
  await page.goto("/create");
  await page
    .getByRole("button", { name: "Image to video", exact: true })
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

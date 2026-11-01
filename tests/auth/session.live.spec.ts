import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

test("real email-code signup, cross-session profile sync, API authorization, persistence and logout", async ({
  page,
  browser,
  request,
}) => {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 14);
  const email = `virel-e2e-${suffix}@example.invalid`;
  const username = `e2e_${suffix}`;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  async function login(target: Page) {
    await target.goto("http://localhost:5190/profile");
    await target
      .getByRole("textbox", { name: "Email", exact: true })
      .fill(email);
    await target
      .getByRole("button", { name: "Send sign-in code", exact: true })
      .click();
    await expect(
      target.getByRole("textbox", { name: "Verification code", exact: true }),
    ).toBeVisible();
    const response = await request.get(
      `http://127.0.0.1:3190/__test/email?email=${encodeURIComponent(email)}`,
    );
    const code = (await response.json()).code;
    if (typeof code !== "string" || !/^\d{6}$/.test(code))
      throw new Error("Fixture SMTP did not capture a code");
    await target
      .getByRole("textbox", { name: "Verification code", exact: true })
      .fill(code);
    await target
      .getByRole("button", { name: "Verify & sign in", exact: true })
      .click();
  }
  await login(page);
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
    await login(second);
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
    // Exercise the authenticated API -> privileged Convex boundary without a paid render.
    const signedUpload = await request.post(
      "http://127.0.0.1:3190/v1/studio/mediaActions%3AbeginUpload",
      {
        headers: { authorization: `Bearer ${token}` },
        data: {
          name: "virel-api-boundary-check.png",
          contentType: "image/png",
          bytes: 68,
        },
      },
    );
    expect(signedUpload.status()).toBe(200);
    const upload = (await signedUpload.json()).value;
    // Assert booleans so failure output cannot expose a bearer-capability URL.
    expect(typeof upload.assetId === "string").toBe(true);
    expect(
      typeof upload.url === "string" &&
        new URL(upload.url).searchParams.has("X-Amz-Signature"),
    ).toBe(true);
    if (process.env.STUDIO_STORAGE_ACCEPTANCE === "1") {
      const directory = await mkdtemp(
        join(tmpdir(), "virel-media-acceptance-"),
      );
      try {
        for (const duration of [15, 16]) {
          const path = join(directory, `reference-${duration}.mp4`);
          execFileSync("ffmpeg", [
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "lavfi",
            "-i",
            "color=c=black:s=128x128:r=5",
            "-t",
            String(duration),
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            path,
          ]);
          const bytes = await readFile(path);
          const begin = await request.post(
            "http://127.0.0.1:3190/v1/studio/mediaActions%3AbeginUpload",
            {
              headers: { authorization: `Bearer ${token}` },
              data: {
                name: `acceptance-${duration}s.mp4`,
                contentType: "video/mp4",
                bytes: bytes.byteLength,
              },
            },
          );
          expect(begin.status()).toBe(200);
          const upload = (await begin.json()).value;
          const put = await fetch(upload.url, {
            method: "PUT",
            headers: { "Content-Type": "video/mp4" },
            body: bytes,
          }).catch(() => {
            throw new Error("Signed media transfer failed; URL suppressed.");
          });
          expect(put.status).toBe(200);
          const finish = await request.post(
            "http://127.0.0.1:3190/v1/studio/mediaActions%3AfinishUpload",
            {
              headers: { authorization: `Bearer ${token}` },
              data: { assetId: upload.assetId },
            },
          );
          if (duration === 16) {
            expect(finish.status()).toBe(400);
            expect((await finish.json()).error).toContain(
              "between 4 and 15 seconds",
            );
          } else {
            expect(finish.status()).toBe(200);
            const preview = await request.post(
              "http://127.0.0.1:3190/v1/studio/mediaActions%3Apreview",
              {
                headers: { authorization: `Bearer ${token}` },
                data: { assetId: upload.assetId },
              },
            );
            expect(preview.status()).toBe(200);
            const playback = await fetch((await preview.json()).value, {
              headers: { Range: "bytes=0-31" },
            }).catch(() => {
              throw new Error("Private range playback failed; URL suppressed.");
            });
            expect(playback.status).toBe(206);
            expect((await playback.arrayBuffer()).byteLength).toBe(32);
          }
        }
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }
    const privateWorker = await request.post(
      "http://127.0.0.1:3190/v1/studio/generationActions%3Asubmit",
      {
        headers: { authorization: `Bearer ${token}` },
        data: {},
      },
    );
    expect(privateWorker.status()).toBe(404);

    const anonymous = await request.get("http://127.0.0.1:3190/v1/me");
    expect(anonymous.status()).toBe(401);
    const invalid = await request.get("http://127.0.0.1:3190/v1/me", {
      headers: { authorization: "Bearer invalid-token" },
    });
    expect(invalid.status()).toBe(401);

    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Welcome to Virel.", exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Welcome to Virel.", exact: true }),
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

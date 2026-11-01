import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import {
  defaultStudioInput,
  bindReference,
  compileRemix,
  validateStudioInput,
  renameReference,
  replaceReference,
} from "@virel/shared";
const modules = import.meta.glob("../convex/**/*.{ts,js}");
const settings = {
  supplierMaximumUsdMicros: 100000,
  creditsPerUsd: 1000,
  markupBps: 3000,
};
test("Create accepts no media and a reference video without deriving output duration", async () => {
  const t = convexTest(schema, modules);
  const userId = await t.run((ctx) => ctx.db.insert("users", {}));
  const user = t.withIdentity({ subject: `${userId}|session` });
  const plain = await user.mutation(internal.generation.saveQuote, {
    ...settings,
    input: { ...defaultStudioInput, prompt: "A scene", duration: 15 },
  });
  expect(plain.duration).toBe(15);
  const video = await t.run((ctx) =>
    ctx.db.insert("mediaAssets", {
      userId,
      key: "video",
      name: "Guidance",
      type: "video",
      contentType: "video/mp4",
      bytes: 100,
      duration: 10,
      status: "ready",
      generated: false,
    }),
  );
  const guided = await user.mutation(internal.generation.saveQuote, {
    ...settings,
    input: {
      ...defaultStudioInput,
      prompt: "Use @video_1",
      referenceVideoAssetId: video,
      duration: 12,
    },
  });
  expect(guided.duration).toBe(12);
  await expect(
    user.mutation(internal.generation.saveQuote, {
      ...settings,
      input: { ...defaultStudioInput, mode: "remix", prompt: "Change scene" },
    }),
  ).rejects.toThrow("Select a source video");
});
test("script segments persist separately by mode with immutable versions and conflict protection", async () => {
  const t = convexTest(schema, modules);
  const [aliceId, bobId] = await t.run(async (ctx) => [
    await ctx.db.insert("users", {}),
    await ctx.db.insert("users", {}),
  ]);
  const alice = t.withIdentity({ subject: `${aliceId}|session` });
  const bob = t.withIdentity({ subject: `${bobId}|session` });
  const segmentId = await alice.mutation(api.studioScripts.ensure, {
    mode: "create",
  });
  expect(
    await alice.mutation(api.studioScripts.ensure, { mode: "create" }),
  ).toBe(segmentId);
  const input = { ...defaultStudioInput, prompt: "A scene", duration: 15 };
  const revision = await alice.mutation(api.studioScripts.save, {
    segmentId,
    expectedRevision: 0,
    title: "Opening",
    input,
  });
  expect(revision).toBe(1);
  await expect(
    alice.mutation(api.studioScripts.save, {
      segmentId,
      expectedRevision: 0,
      title: "Stale",
      input,
    }),
  ).rejects.toThrow("another session");
  await expect(
    bob.query(api.studioScripts.versions, { segmentId }),
  ).rejects.toThrow("unavailable");
  await alice.mutation(api.studioScripts.save, {
    segmentId,
    expectedRevision: 1,
    title: "Opening",
    input: { ...input, prompt: "Revised scene" },
  });
  const versions = await alice.query(api.studioScripts.versions, { segmentId });
  expect(versions.map((v) => v.input.prompt)).toEqual([
    "Revised scene",
    "A scene",
  ]);
  expect(await alice.query(api.studioScripts.list, { mode: "remix" })).toEqual(
    [],
  );
  await expect(
    alice.mutation(internal.generation.saveQuote, {
      ...settings,
      input: { ...input, segmentId, scriptVersion: 1 },
    }),
  ).rejects.toThrow("Save the current script");
});
test("Create cannot bypass a creator's video permissions", async () => {
  const t = convexTest(schema, modules);
  const [owner, viewer] = await t.run(async (ctx) => [
    await ctx.db.insert("users", {}),
    await ctx.db.insert("users", {}),
  ]);
  const assetId = await t.run((ctx) =>
    ctx.db.insert("mediaAssets", {
      userId: owner,
      key: "video",
      name: "Private",
      type: "video",
      contentType: "video/mp4",
      bytes: 100,
      duration: 10,
      status: "ready",
      generated: false,
    }),
  );
  const user = t.withIdentity({ subject: `${viewer}|session` });
  await expect(
    user.query(internal.generation.context, {
      input: {
        ...defaultStudioInput,
        prompt: "Reference",
        referenceVideoAssetId: assetId,
      },
    }),
  ).rejects.toThrow("your own source");
});
test("named references retain identity through replacement and support 30 Create images", () => {
  let input: import("@virel/shared").StudioInput = {
    ...defaultStudioInput,
    prompt: "Use @image_1",
    ...bindReference(defaultStudioInput, "a", "image"),
  };
  input = { ...input, ...renameReference(input, "a", "wardrobe") };
  expect(input.prompt).toBe("Use @wardrobe");
  input = { ...input, ...replaceReference(input, "a", "b") };
  expect(input.referenceAssetIds).toEqual(["b"]);
  expect(compileRemix(input)).toBe("Use image 1");
  expect(() =>
    validateStudioInput({
      ...defaultStudioInput,
      prompt: "Scene",
      referenceAssetIds: Array.from({ length: 30 }, (_, i) => String(i)),
      duration: 15,
    }),
  ).not.toThrow();
});

test("Create rejects outputs above 15 seconds before creating a quote", async () => {
  const t = convexTest(schema, modules);
  const userId = await t.run((ctx) => ctx.db.insert("users", {}));
  const user = t.withIdentity({ subject: `${userId}|session` });
  await expect(
    user.mutation(internal.generation.saveQuote, {
      ...settings,
      input: { ...defaultStudioInput, prompt: "A scene", duration: 16 },
    }),
  ).rejects.toThrow("4 and 15 seconds");
  expect(
    await t.run((ctx) => ctx.db.query("generationQuotes").take(1)),
  ).toHaveLength(0);
});

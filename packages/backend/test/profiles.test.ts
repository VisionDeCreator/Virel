import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";
const modules = import.meta.glob("../convex/**/*.{ts,js}");
test("profile ownership and username uniqueness are enforced", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.mutation(api.profiles.save, {
      username: "alice",
      displayName: "Alice",
      bio: "",
    }),
  ).rejects.toThrow("Sign in");
  const [aliceId, bobId] = await t.run(async (ctx) => [
    await ctx.db.insert("users", {}),
    await ctx.db.insert("users", {}),
  ]);
  const alice = t.withIdentity({ subject: `${aliceId}|session-a` });
  const bob = t.withIdentity({ subject: `${bobId}|session-b` });
  await alice.mutation(api.profiles.save, {
    username: "Alice",
    displayName: "Alice",
    bio: "Creator",
  });
  expect((await alice.query(api.profiles.me))?.username).toBe("alice");
  expect(await bob.query(api.profiles.me)).toBeNull();
  await expect(
    bob.mutation(api.profiles.save, {
      username: "alice",
      displayName: "Bob",
      bio: "",
    }),
  ).rejects.toThrow("already taken");
});
test("feed exposes only public published videos and supports pagination", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const creatorId = await ctx.db.insert("users", {});
    for (const [visibility, status] of [
      ["public", "published"],
      ["private", "published"],
      ["public", "hidden"],
    ] as const)
      await ctx.db.insert("videos", {
        creatorId,
        title: "Test",
        description: "",
        playbackUrl: "https://example.com/video.mp4",
        visibility,
        status,
        publishedAt: 1,
        remixEnabled: false,
        royaltyEligible: false,
      });
  });
  const page = await t.query(api.feed.list, {
    paginationOpts: { cursor: null, numItems: 10 },
  });
  expect(page.page).toHaveLength(1);
  expect(page.isDone).toBe(true);
});

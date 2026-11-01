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

test("public profiles exclude private account data and follows are idempotent", async () => {
  const t = convexTest(schema, modules);
  const [aliceId, bobId] = await t.run(async (ctx) => [
    await ctx.db.insert("users", { email: "private@example.com" }),
    await ctx.db.insert("users", {}),
  ]);
  const alice = t.withIdentity({ subject: `${aliceId}|a` });
  const bob = t.withIdentity({ subject: `${bobId}|b` });
  await alice.mutation(api.profiles.save, {
    username: "alice",
    displayName: "Alice",
    bio: "Public bio",
  });
  await bob.mutation(api.profiles.save, {
    username: "bob",
    displayName: "Bob",
    bio: "",
  });
  await bob.mutation(api.profiles.setFollowing, {
    username: "alice",
    following: true,
  });
  await bob.mutation(api.profiles.setFollowing, {
    username: "alice",
    following: true,
  });
  const profile = await t.query(api.profiles.publicProfile, {
    username: "alice",
  });
  expect(profile?.followers).toBe(1);
  expect(profile?.isOwner).toBe(false);
  expect(Object.keys(profile!).sort()).toEqual(
    [
      "username",
      "displayName",
      "bio",
      "hasAvatar",
      "avatarVersion",
      "followers",
      "following",
      "isOwner",
      "isFollowing",
    ].sort(),
  );
  expect(
    (await bob.query(api.profiles.publicProfile, { username: "alice" }))
      ?.isFollowing,
  ).toBe(true);
  await bob.mutation(api.profiles.setFollowing, {
    username: "alice",
    following: false,
  });
  await bob.mutation(api.profiles.setFollowing, {
    username: "alice",
    following: false,
  });
  expect(
    (await t.query(api.profiles.publicProfile, { username: "alice" }))
      ?.followers,
  ).toBe(0);
  await expect(
    alice.mutation(api.profiles.setFollowing, {
      username: "alice",
      following: true,
    }),
  ).rejects.toThrow("another creator");
  await expect(
    t.mutation(api.profiles.setFollowing, {
      username: "alice",
      following: true,
    }),
  ).rejects.toThrow("Sign in");
  await t.run(async (ctx) => {
    for (const visibility of ["private", "public"] as const)
      await ctx.db.insert("videos", {
        creatorId: aliceId,
        title: visibility,
        description: "",
        visibility,
        status: "published",
        playbackUrl: "https://example.com/video.mp4",
        publishedAt: 1,
        remixEnabled: true,
        royaltyEligible: false,
      });
  });
  const videos = await t.query(api.profiles.videos, {
    username: "alice",
    paginationOpts: { cursor: null, numItems: 12 },
  });
  expect(videos.page.map((video) => video.title)).toEqual(["public"]);
  expect(videos.page[0]).not.toHaveProperty("creatorId");
});

test("profile pictures must be verified images owned by the current user", async () => {
  const t = convexTest(schema, modules);
  const [aliceId, bobId] = await t.run(async (ctx) => [
    await ctx.db.insert("users", {}),
    await ctx.db.insert("users", {}),
  ]);
  const alice = t.withIdentity({ subject: `${aliceId}|a` });
  const bob = t.withIdentity({ subject: `${bobId}|b` });
  await alice.mutation(api.profiles.save, {
    username: "alice",
    displayName: "Alice",
    bio: "",
  });
  await bob.mutation(api.profiles.save, {
    username: "bob",
    displayName: "Bob",
    bio: "",
  });
  const image = await t.run((ctx) =>
    ctx.db.insert("mediaAssets", {
      userId: aliceId,
      key: "private/avatar",
      name: "Avatar",
      type: "image",
      contentType: "image/png",
      bytes: 50,
      status: "ready",
      generated: false,
    }),
  );
  await expect(
    bob.mutation(api.profiles.setAvatar, { assetId: image }),
  ).rejects.toThrow("you own");
  await alice.mutation(api.profiles.setAvatar, { assetId: image });
  const publicProfile = await bob.query(api.profiles.publicProfile, {
    username: "alice",
  });
  expect(publicProfile?.hasAvatar).toBe(true);
  expect(publicProfile).not.toHaveProperty("avatarAssetId");
});

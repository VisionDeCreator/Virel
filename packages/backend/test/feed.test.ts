import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";
const modules = import.meta.glob("../convex/**/*.{ts,js}");
async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const alice = await ctx.db.insert("users", {});
    const bob = await ctx.db.insert("users", {});
    await ctx.db.insert("profiles", {
      userId: alice,
      username: "alice",
      displayName: "Alice",
      bio: "",
    });
    await ctx.db.insert("profiles", {
      userId: bob,
      username: "bob",
      displayName: "Bob",
      bio: "",
    });
    const video = await ctx.db.insert("videos", {
      creatorId: alice,
      title: "A",
      description: "",
      playbackUrl: "https://example.com/a.mp4",
      visibility: "public",
      status: "published",
      publishedAt: 1,
      remixEnabled: true,
      royaltyEligible: true,
    });
    const other = await ctx.db.insert("videos", {
      creatorId: bob,
      title: "B",
      description: "",
      playbackUrl: "https://example.com/b.mp4",
      visibility: "public",
      status: "published",
      publishedAt: 2,
      remixEnabled: false,
      royaltyEligible: false,
    });
    return { alice, bob, video, other };
  });
  return {
    t,
    ...ids,
    aliceClient: t.withIdentity({ subject: `${ids.alice}|a` }),
    bobClient: t.withIdentity({ subject: `${ids.bob}|b` }),
  };
}
const paginationOpts = { numItems: 12, cursor: null };
test("reactions require auth, are idempotent, and bookmarks stay private", async () => {
  const { t, video, bobClient, aliceClient } = await setup();
  await expect(
    t.mutation(api.feed.setReaction, {
      videoId: video,
      kind: "like",
      active: true,
    }),
  ).rejects.toThrow("Sign in");
  await Promise.all(
    [1, 2].map(() =>
      bobClient.mutation(api.feed.setReaction, {
        videoId: video,
        kind: "like",
        active: true,
      }),
    ),
  );
  await bobClient.mutation(api.feed.setReaction, {
    videoId: video,
    kind: "bookmark",
    active: true,
  });
  const bobPost = await bobClient.query(api.feed.post, { videoId: video });
  expect(bobPost).toMatchObject({
    likeCount: 1,
    liked: true,
    bookmarked: true,
  });
  expect(
    await aliceClient.query(api.feed.post, { videoId: video }),
  ).toMatchObject({ likeCount: 1, liked: false, bookmarked: false });
  expect(
    (await aliceClient.query(api.feed.list, { mode: "saved", paginationOpts }))
      .page,
  ).toHaveLength(0);
  expect(
    (
      await bobClient.query(api.feed.list, { mode: "saved", paginationOpts })
    ).page.map((p) => p._id),
  ).toEqual([video]);
  await bobClient.mutation(api.feed.setReaction, {
    videoId: video,
    kind: "like",
    active: false,
  });
  await bobClient.mutation(api.feed.setReaction, {
    videoId: video,
    kind: "like",
    active: false,
  });
  expect(
    await bobClient.query(api.feed.post, { videoId: video }),
  ).toMatchObject({ likeCount: 0 });
});
test("comments enforce ownership, validate reply targets and preserve deleted threads", async () => {
  const { t, video, other, bobClient, aliceClient } = await setup();
  await expect(
    bobClient.mutation(api.feed.addComment, { videoId: video, body: " " }),
  ).rejects.toThrow("1–2,000");
  await bobClient.mutation(api.feed.addComment, {
    videoId: video,
    body: "Hello",
  });
  const comment = (
    await t.query(api.feed.comments, { videoId: video, paginationOpts })
  ).page[0];
  await expect(
    aliceClient.mutation(api.feed.deleteComment, { commentId: comment._id }),
  ).rejects.toThrow("own comments");
  await expect(
    aliceClient.mutation(api.feed.addComment, {
      videoId: other,
      parentId: comment._id,
      body: "Wrong post",
    }),
  ).rejects.toThrow("unavailable");
  await aliceClient.mutation(api.feed.addComment, {
    videoId: video,
    parentId: comment._id,
    body: "Reply",
  });
  await bobClient.mutation(api.feed.deleteComment, { commentId: comment._id });
  await bobClient.mutation(api.feed.deleteComment, { commentId: comment._id });
  const comments = (
    await t.query(api.feed.comments, { videoId: video, paginationOpts })
  ).page;
  expect(comments).toHaveLength(2);
  expect(comments.find((c) => c._id === comment._id)).toMatchObject({
    deleted: true,
    body: "Comment deleted",
  });
  expect(await t.query(api.feed.post, { videoId: video })).toMatchObject({
    commentCount: 1,
  });
});
test("following, dismissal, reports and hiding respect post access", async () => {
  const { t, video, other, bobClient, aliceClient } = await setup();
  await bobClient.mutation(api.profiles.setFollowing, {
    username: "alice",
    following: true,
  });
  expect(
    (
      await bobClient.query(api.feed.list, {
        mode: "following",
        paginationOpts,
      })
    ).page.map((p) => p._id),
  ).toEqual([video]);
  await bobClient.mutation(api.feed.setReaction, {
    videoId: video,
    kind: "dismiss",
    active: true,
  });
  expect(
    (await bobClient.query(api.feed.list, { paginationOpts })).page.map(
      (p) => p._id,
    ),
  ).toEqual([other]);
  await bobClient.mutation(api.feed.report, { videoId: video, reason: "Spam" });
  await bobClient.mutation(api.feed.report, { videoId: video, reason: "Spam" });
  expect(
    await t.run((ctx) => ctx.db.query("postReports").take(10)),
  ).toHaveLength(1);
  await expect(
    bobClient.mutation(api.feed.hide, { videoId: video }),
  ).rejects.toThrow("own posts");
  await aliceClient.mutation(api.feed.hide, { videoId: video });
  expect(await t.query(api.feed.post, { videoId: video })).toBeNull();
  await expect(
    bobClient.mutation(api.feed.setReaction, {
      videoId: video,
      kind: "like",
      active: true,
    }),
  ).rejects.toThrow("unavailable");
});
test("frozen batch ranking is stable across reactions and excludes posts published after session start", async () => {
  const { t, video, other, alice, bobClient } = await setup();
  const session = {
    startedAt: 2,
    affinities: [{ creatorId: alice, weight: 10 }],
    seen: [],
  };
  const first = await bobClient.query(api.feed.list, {
    session,
    paginationOpts: { numItems: 1, cursor: null },
  });
  await bobClient.mutation(api.feed.setReaction, {
    videoId: other,
    kind: "like",
    active: true,
  });
  const same = await bobClient.query(api.feed.list, {
    session,
    paginationOpts: { numItems: 1, cursor: null },
  });
  expect(same.page.map((p) => p._id)).toEqual(first.page.map((p) => p._id));
  const next = await bobClient.query(api.feed.list, {
    session,
    paginationOpts: { numItems: 1, cursor: first.continueCursor },
  });
  expect(new Set([...first.page, ...next.page].map((p) => p._id)).size).toBe(2);
  const ranked = await bobClient.query(api.feed.list, {
    session,
    paginationOpts,
  });
  expect(ranked.page.map((p) => p._id)).toEqual([video, other]);
  await t.run((ctx) => ctx.db.patch(other, { publishedAt: 3 }));
  expect(
    (
      await bobClient.query(api.feed.list, { session, paginationOpts })
    ).page.map((p) => p._id),
  ).toEqual([video]);
});
test("watch signals distinguish autoplay, explicit viewing and invalid input", async () => {
  const { t, video, alice, bobClient } = await setup();
  await bobClient.mutation(api.feed.watch, {
    videoId: video,
    completion: 0.9,
    deliberate: false,
  });
  const autoplay = await bobClient.query(api.feed.preferences, {});
  await bobClient.mutation(api.feed.watch, {
    videoId: video,
    completion: 0.9,
    deliberate: true,
  });
  const deliberate = await bobClient.query(api.feed.preferences, {});
  expect(
    deliberate.affinities.find((a) => a.creatorId === alice)!.weight,
  ).toBeGreaterThan(
    autoplay.affinities.find((a) => a.creatorId === alice)!.weight,
  );
  expect(deliberate.seen).toContain(video);
  await expect(
    bobClient.mutation(api.feed.watch, {
      videoId: video,
      completion: 2,
      deliberate: true,
    }),
  ).rejects.toThrow("Invalid");
  await t.mutation(api.feed.watch, {
    videoId: video,
    completion: 0.5,
    deliberate: true,
  });
  expect(
    await t.run((ctx) => ctx.db.query("videoSignals").take(10)),
  ).toHaveLength(1);
});

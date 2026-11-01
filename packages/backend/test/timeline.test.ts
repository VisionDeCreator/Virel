import { convexTest } from "convex-test";
import { expect, test, vi, afterEach } from "vitest";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import {
  defaultStudioInput,
  emptyTimeline,
  newTimelineClip,
  splitTimelineClip,
  timelineDuration,
  validateTimeline,
  validateEditorUpload,
} from "@virel/shared";
import type { Id } from "../convex/_generated/dataModel";
const modules = import.meta.glob("../convex/**/*.{ts,js}");
afterEach(() => vi.useRealTimers());
async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const user = await ctx.db.insert("users", {}),
      other = await ctx.db.insert("users", {}),
      rootCreator = await ctx.db.insert("users", {});
    const clip = await ctx.db.insert("mediaAssets", {
      userId: user,
      key: "own.mp4",
      name: "Own clip",
      type: "video",
      contentType: "video/mp4",
      bytes: 100,
      duration: 5,
      width: 720,
      height: 1280,
      status: "ready",
      generated: true,
    });
    const foreign = await ctx.db.insert("mediaAssets", {
      userId: other,
      key: "foreign.mp4",
      name: "Other clip",
      type: "video",
      contentType: "video/mp4",
      bytes: 100,
      duration: 5,
      status: "ready",
      generated: false,
    });
    const music = await ctx.db.insert("mediaAssets", {
      userId: user,
      key: "music.mp3",
      name: "Music",
      type: "audio",
      contentType: "audio/mpeg",
      bytes: 100,
      duration: 60,
      status: "ready",
      generated: false,
      purpose: "editor",
    });
    const root = await ctx.db.insert("videos", {
      creatorId: rootCreator,
      title: "Root",
      description: "",
      playbackUrl: "https://example.com/root",
      visibility: "public",
      status: "published",
      publishedAt: 1,
      remixEnabled: true,
      royaltyEligible: true,
    });
    const editedRemix = await ctx.db.insert("videos", {
      creatorId: user,
      assetId: clip,
      rootVideoId: root,
      parentVideoId: root,
      lineageDepth: 1,
      title: "Own remix",
      description: "",
      playbackUrl: "",
      visibility: "private",
      status: "draft",
      publishedAt: 0,
      remixEnabled: false,
      royaltyEligible: true,
    });
    const quoteId = await ctx.db.insert("generationQuotes", {
      userId: user,
      input: defaultStudioInput,
      inputKey: "source",
      credits: 0,
      supplierMaximumUsdMicros: 0,
      creditsPerUsd: 1000,
      markupBps: 0,
      pricingVersion: "test",
      expiresAt: Date.now() + 10000,
    });
    await ctx.db.insert("generationJobs", {
      userId: user,
      input: defaultStudioInput,
      quoteId,
      requestId: "source",
      status: "succeeded",
      credits: 0,
      financialState: "settled",
      allocations: [],
      supplierMaximumUsdMicros: 0,
      outputAssetId: clip,
      videoId: editedRemix,
      royaltyBeneficiaries: [],
      updatedAt: Date.now(),
      pollCount: 0,
    });
    return {
      user,
      other,
      rootCreator,
      clip,
      foreign,
      music,
      root,
      editedRemix,
    };
  });
  const user = t.withIdentity({ subject: `${ids.user}|user` }),
    other = t.withIdentity({ subject: `${ids.other}|other` });
  const project = await user.mutation(api.timeline.create, {
    videoId: ids.editedRemix,
  });
  return { t, ...ids, client: user, otherClient: other, project };
}
test("trim, split, transitions and timed layers validate against actual timeline duration", () => {
  const document = {
    ...emptyTimeline,
    clips: [
      {
        ...newTimelineClip("source", 5, "first"),
        transition: "crossfade" as const,
        transitionDuration: 0.5,
      },
      newTimelineClip("source", 5, "second"),
    ],
  };
  expect(timelineDuration(document)).toBe(9.5);
  expect(() => validateTimeline(document)).not.toThrow();
  expect(
    splitTimelineClip(document, "second", 2.5, "third").clips,
  ).toHaveLength(3);
  expect(() => splitTimelineClip(document, "second", 5, "third")).toThrow(
    "inside",
  );
  expect(() =>
    validateTimeline({
      ...document,
      texts: [
        {
          id: "t",
          text: "outside",
          start: 0,
          end: 10,
          x: 0.5,
          y: 0.5,
          size: 48,
          color: "#ffffff",
          font: "sans",
        },
      ],
    }),
  ).toThrow("text");
});
test("project ownership and media ownership are enforced by the server", async () => {
  const s = await setup();
  await expect(
    s.otherClient.query(api.timeline.get, { projectId: s.project }),
  ).rejects.toThrow("unavailable");
  await expect(
    s.otherClient.mutation(api.timeline.create, { videoId: s.editedRemix }),
  ).rejects.toThrow("generated video");
  const project = await s.client.query(api.timeline.get, {
    projectId: s.project,
  });
  await expect(
    s.client.mutation(api.timeline.save, {
      projectId: s.project,
      revision: 0,
      title: "Invalid ownership",
      document: {
        ...project.document,
        clips: [{ ...project.document.clips[0], assetId: s.foreign }],
      },
    }),
  ).rejects.toThrow("you own");
  await expect(
    s.t.query(api.timeline.list, {
      paginationOpts: { cursor: null, numItems: 12 },
    }),
  ).rejects.toThrow("Sign in");
});
test("different creator lineages cannot be laundered through owned generated or edited clips", async () => {
  const s = await setup();
  const foreignBranch = await s.t.run(async (ctx) => {
    const asset = await ctx.db.insert("mediaAssets", {
      userId: s.user,
      key: "branch.mp4",
      name: "Branch",
      type: "video",
      contentType: "video/mp4",
      bytes: 100,
      duration: 5,
      status: "ready",
      generated: false,
      purpose: "editor",
    });
    const video = await ctx.db.insert("videos", {
      creatorId: s.user,
      assetId: asset,
      rootVideoId: s.root,
      parentVideoId: s.editedRemix,
      lineageDepth: 2,
      title: "Different parent",
      description: "",
      playbackUrl: "",
      visibility: "private",
      status: "draft",
      publishedAt: 0,
      remixEnabled: false,
      royaltyEligible: true,
    });
    await ctx.db.patch(asset, { timelineVideoId: video });
    return asset;
  });
  const project = await s.client.query(api.timeline.get, {
    projectId: s.project,
  });
  await expect(
    s.client.mutation(api.timeline.save, {
      projectId: s.project,
      revision: 0,
      title: "Mixed parents",
      document: {
        ...project.document,
        clips: [
          ...project.document.clips,
          newTimelineClip(
            foreignBranch,
            5,
            "branch",
          ) as (typeof project.document.clips)[number],
        ],
      },
    }),
  ).rejects.toThrow("generated video");
  expect(
    (await s.client.query(api.timeline.assets, { projectId: s.project })).map(
      (a) => a._id,
    ),
  ).not.toContain(foreignBranch);
});
test("autosave uses revision checks and export queue is repeat-safe and isolated from AI billing", async () => {
  const s = await setup();
  const project = await s.client.query(api.timeline.get, {
    projectId: s.project,
  });
  const document = {
    ...project.document,
    clips: [{ ...project.document.clips[0], start: 1, end: 4 }],
    audio: [
      {
        id: "song",
        assetId: s.music,
        start: 0,
        end: 3,
        at: 0,
        volume: 0.4,
        fadeIn: 0.2,
        fadeOut: 0.2,
      },
    ],
  };
  const revision = await s.client.mutation(api.timeline.save, {
    projectId: s.project,
    revision: 0,
    title: "Edited",
    document,
  });
  await expect(
    s.client.mutation(api.timeline.save, {
      projectId: s.project,
      revision: 0,
      title: "Stale",
      document,
    }),
  ).rejects.toThrow("another device");
  const id = await s.client.mutation(api.timeline.queueExport, {
    projectId: s.project,
    revision,
  });
  expect(
    await s.client.mutation(api.timeline.queueExport, {
      projectId: s.project,
      revision,
    }),
  ).toBe(id);
  expect(
    await s.t.run((ctx) => ctx.db.query("apiTasks").take(10)),
  ).toHaveLength(1);
  expect(
    await s.t.run((ctx) => ctx.db.query("generationJobs").take(10)),
  ).toHaveLength(1);
  expect(
    await s.t.run((ctx) => ctx.db.query("creditLedger").take(10)),
  ).toHaveLength(0);
  expect(
    await s.t.run((ctx) => ctx.db.query("royaltiesLedger").take(10)),
  ).toHaveLength(0);
});
test("export completion is lease-fenced, immutable, private and preserves attribution", async () => {
  vi.useFakeTimers();
  const s = await setup();
  const id = await s.client.mutation(api.timeline.queueExport, {
    projectId: s.project,
    revision: 0,
  });
  const first = (await s.t.mutation(internal.tasks.claim, {}))!;
  const context = await s.t.mutation(internal.tasks.commit, {
    taskId: first._id,
    token: first.leaseToken,
    operation: "timeline:beginRender",
    args: { exportId: id },
  });
  await expect(
    s.t.mutation(internal.tasks.commit, {
      taskId: first._id,
      token: first.leaseToken,
      operation: "generation:fail",
      args: { jobId: "wrong" },
    }),
  ).rejects.toThrow("unavailable");
  vi.advanceTimersByTime(300001);
  const second = (await s.t.mutation(internal.tasks.claim, {}))!;
  const next = await s.t.mutation(internal.tasks.commit, {
    taskId: second._id,
    token: second.leaseToken,
    operation: "timeline:beginRender",
    args: { exportId: id },
  });
  await expect(
    s.t.mutation(internal.tasks.commit, {
      taskId: first._id,
      token: first.leaseToken,
      operation: "timeline:completeExport",
      args: { exportId: id, key: context.key, bytes: 100 },
    }),
  ).rejects.toThrow("lease expired");
  const complete = {
    taskId: second._id,
    token: second.leaseToken,
    operation: "timeline:completeExport",
    args: { exportId: id, key: next.key, bytes: 100 },
  };
  await s.t.mutation(internal.tasks.commit, complete);
  await s.t.mutation(internal.tasks.commit, complete);
  const project = await s.client.query(api.timeline.get, {
    projectId: s.project,
  });
  expect(project.latestExport).toMatchObject({ status: "ready", progress: 1 });
  const video = await s.t.run((ctx) =>
    ctx.db.get(project.latestExport!.videoId!),
  );
  expect(video).toMatchObject({
    visibility: "private",
    rootVideoId: s.root,
    parentVideoId: s.root,
    lineageDepth: 1,
    royaltyEligible: true,
  });
  expect(
    await s.t.run((ctx) => ctx.db.query("royaltiesLedger").take(10)),
  ).toHaveLength(0);
  expect(
    (await s.t.run((ctx) => ctx.db.query("mediaGarbage").take(10))).map(
      (g) => g.key,
    ),
  ).toContain(context.key);
});
test("publishing uses the rendered asset and rejects stale revisions", async () => {
  const s = await setup();
  await s.client.mutation(api.profiles.save, {
    username: "editor",
    displayName: "Editor",
    bio: "",
  });
  const id = await s.client.mutation(api.timeline.queueExport, {
    projectId: s.project,
    revision: 0,
  });
  const context = (await s.t.mutation(internal.timeline.beginRender, {
    exportId: id,
  }))!;
  await s.t.mutation(internal.timeline.completeExport, {
    exportId: id,
    key: context.key,
    bytes: 123,
  });
  const args = {
    exportId: id,
    title: "My edit",
    description: "Manual edit",
    remixEnabled: true,
    playbackBase: "https://api.example.com",
  };
  await expect(
    s.otherClient.mutation(internal.timeline.publish, args),
  ).rejects.toThrow("completed");
  const videoId = await s.client.mutation(internal.timeline.publish, args);
  expect(
    await s.t.query(internal.media.publishedAsset, { videoId }),
  ).toMatchObject({ key: context.key, generated: false });
  const project = await s.client.query(api.timeline.get, {
    projectId: s.project,
  });
  await s.client.mutation(api.timeline.save, {
    projectId: s.project,
    revision: 0,
    title: "Changed title",
    document: project.document,
  });
  await expect(
    s.client.mutation(internal.timeline.publish, args),
  ).rejects.toThrow("latest saved");
});
test("projects reject imported videos and additional owned videos", async () => {
  const s = await setup();
  const rawVideo = await s.t.run(async (ctx) => {
    const assetId = await ctx.db.insert("mediaAssets", {
      userId: s.user,
      key: "raw",
      name: "raw",
      type: "video",
      contentType: "video/mp4",
      bytes: 10,
      duration: 2,
      status: "ready",
      generated: false,
    });
    return ctx.db.insert("videos", {
      creatorId: s.user,
      assetId,
      title: "raw",
      description: "",
      playbackUrl: "",
      visibility: "private",
      status: "draft",
      publishedAt: 0,
      remixEnabled: false,
      royaltyEligible: false,
    });
  });
  await expect(
    s.client.mutation(api.timeline.create, { videoId: rawVideo }),
  ).rejects.toThrow("generated video");
  const project = await s.client.query(api.timeline.get, {
    projectId: s.project,
  });
  const document = {
    ...project.document,
    clips: [
      ...project.document.clips,
      { ...project.document.clips[0]!, id: "duplicate" },
    ],
  };
  await expect(
    s.client.mutation(api.timeline.save, {
      projectId: s.project,
      revision: 0,
      title: "Split source",
      document,
    }),
  ).resolves.toBe(1);
});

test("editing an original preserves first-remix royalties instead of adding a paid remix level", async () => {
  const s = await setup();
  const original = await s.t.run(async (ctx) => {
    const video = await ctx.db.insert("videos", {
      creatorId: s.user,
      assetId: s.clip,
      lineageDepth: 0,
      title: "Original",
      description: "",
      playbackUrl: "",
      visibility: "private",
      status: "draft",
      publishedAt: 0,
      remixEnabled: true,
      royaltyEligible: true,
    });
    const job = await ctx.db
      .query("generationJobs")
      .withIndex("by_outputAssetId", (q) => q.eq("outputAssetId", s.clip))
      .unique();
    await ctx.db.patch(job!._id, { videoId: video });
    return video;
  });
  const projectId = await s.client.mutation(api.timeline.create, {
    videoId: original,
  });
  const exportId = await s.client.mutation(api.timeline.queueExport, {
    projectId,
    revision: 0,
  });
  const context = (await s.t.mutation(internal.timeline.beginRender, {
    exportId,
  }))!;
  await s.t.mutation(internal.timeline.completeExport, {
    exportId,
    key: context.key,
    bytes: 123,
  });
  const edited = (await s.client.query(api.timeline.get, { projectId }))
    .latestExport!;
  await s.t.run((ctx) =>
    ctx.db.patch(edited.videoId!, {
      visibility: "public",
      status: "published",
      remixEnabled: true,
    }),
  );
  await s.t.mutation(internal.credits.grant, {
    userId: s.other,
    credits: 1000,
    operationKey: "remix-funding",
  });
  const image = await s.t.run(async (ctx) => {
    const lot = (await ctx.db
      .query("creditLots")
      .withIndex("by_userId", (q) => q.eq("userId", s.other))
      .unique())!;
    await ctx.db.patch(lot._id, { kind: "purchased" });
    return ctx.db.insert("mediaAssets", {
      userId: s.other,
      name: "Image",
      key: "image.png",
      contentType: "image/png",
      bytes: 20,
      type: "image",
      status: "ready",
      generated: false,
    });
  });
  const quote = await s.otherClient.mutation(internal.generation.saveQuote, {
    input: {
      ...defaultStudioInput,
      mode: "remix",
      sourceVideoId: edited.videoId!,
      referenceAssetIds: [image],
      prompt: "Use @image_1 in this remix",
    },
    supplierMaximumUsdMicros: 100000,
    creditsPerUsd: 1000,
    markupBps: 3000,
  });
  const jobId = await s.otherClient.mutation(api.generation.start, {
    quoteId: quote.quoteId,
    requestId: "remix-manually-edited-original",
  });
  expect(
    (await s.t.query(internal.generation.jobContext, { jobId })).job
      .royaltyBeneficiaries,
  ).toEqual([{ userId: s.user, usdMicros: 10000 }]);
});

test("failed export retry reuses the durable task and only one owner export can run", async () => {
  const s = await setup();
  const exportId = await s.client.mutation(api.timeline.queueExport, {
    projectId: s.project,
    revision: 0,
  });
  const task = (await s.t.mutation(internal.tasks.claim, {}))!;
  await s.t.mutation(internal.tasks.commit, {
    taskId: task._id,
    token: task.leaseToken,
    operation: "timeline:failExport",
    args: { exportId, error: "Retryable render failure" },
  });
  expect(
    await s.client.mutation(api.timeline.queueExport, {
      projectId: s.project,
      revision: 0,
    }),
  ).toBe(exportId);
  expect(
    await s.t.run((ctx) => ctx.db.query("apiTasks").take(10)),
  ).toHaveLength(1);
  await s.t.mutation(internal.tasks.finish, {
    taskId: task._id,
    token: task.leaseToken,
  });
  expect(await s.t.mutation(internal.tasks.claim, {})).not.toBeNull();
  const otherProject = await s.client.mutation(api.timeline.create, {
    videoId: s.editedRemix,
  });
  await expect(
    s.client.mutation(api.timeline.queueExport, {
      projectId: otherProject,
      revision: 0,
    }),
  ).rejects.toThrow("current export");
});

test("editor uploads accept music and reject all video uploads", () => {
  expect(validateEditorUpload("audio/mpeg", 100)).toBe("audio");
  for (const type of ["video/mp4", "video/quicktime", "video/webm"])
    expect(() => validateEditorUpload(type, 100)).toThrow("Only music");
});

test("other owned generations are rejected at save, export, render and publish", async () => {
  const s = await setup();
  const source = await s.client.query(api.timeline.get, {
    projectId: s.project,
  });
  const otherAsset = await s.t.run(async (ctx) => {
    const asset = (await ctx.db.get(s.clip))!;
    const { _id, _creationTime, ...fields } = asset;
    const assetId = await ctx.db.insert("mediaAssets", {
      ...fields,
      key: "second.mp4",
    });
    const job = (await ctx.db
      .query("generationJobs")
      .withIndex("by_outputAssetId", (q) => q.eq("outputAssetId", s.clip))
      .unique())!;
    const { _id: jobId, _creationTime: created, ...jobFields } = job;
    await ctx.db.insert("generationJobs", {
      ...jobFields,
      requestId: "second",
      outputAssetId: assetId,
    });
    return assetId;
  });
  const document = {
    ...source.document,
    clips: [{ ...source.document.clips[0]!, assetId: otherAsset }],
  };
  await expect(
    s.client.mutation(api.timeline.save, {
      projectId: s.project,
      revision: 0,
      title: "Other video",
      document,
    }),
  ).rejects.toThrow("generated video");
  const assets = await s.client.query(api.timeline.assets, {
    projectId: s.project,
  });
  expect(assets.filter((a) => a.type === "video").map((a) => a._id)).toEqual([
    s.clip,
  ]);
  const exportId = await s.client.mutation(api.timeline.queueExport, {
    projectId: s.project,
    revision: 0,
  });
  await s.t.run((ctx) => ctx.db.patch(s.project, { document }));
  await expect(
    s.client.mutation(api.timeline.queueExport, {
      projectId: s.project,
      revision: 0,
    }),
  ).rejects.toThrow("generated video");
  await s.t.run((ctx) => ctx.db.patch(exportId, { document }));
  expect(
    await s.t.mutation(internal.timeline.beginRender, { exportId }),
  ).toBeNull();
  await s.t.run((ctx) =>
    ctx.db.patch(exportId, { status: "ready", videoId: s.editedRemix }),
  );
  await expect(
    s.client.mutation(internal.timeline.publish, {
      exportId,
      title: "Other",
      description: "",
      remixEnabled: false,
      playbackBase: "https://example.com",
    }),
  ).rejects.toThrow("generated video");
});

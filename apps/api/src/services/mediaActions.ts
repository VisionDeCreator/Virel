import { v } from "convex/values";
import { action } from "../runtime/operation";
import { internal } from "../../../../packages/backend/convex/_generated/api";
import {
  storage,
  uploadUrl,
  readUrl,
  inspectVideo,
  HeadObjectCommand,
  GetObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
} from "./r2";
import { imageSize } from "image-size";
import { fileTypeFromBuffer } from "file-type";
export const beginUpload = action({
  args: { name: v.string(), contentType: v.string(), bytes: v.number() },
  handler: async (ctx, args): Promise<{ assetId: string; url: string }> => {
    storage();
    const assetId = await ctx.runMutation(internal.media.createUpload, args);
    const asset = await ctx.runQuery(internal.media.owned, { assetId });
    return {
      assetId,
      url: await uploadUrl(asset.key, args.contentType, args.bytes),
    };
  },
});
export const finishUpload = action({
  args: { assetId: v.id("mediaAssets") },
  handler: async (ctx, args): Promise<string> => {
    const { asset, token } = await ctx.runMutation(
      internal.media.claimCompletion,
      args,
    );
    if (!token) return asset._id;
    const { client, bucket } = storage();
    try {
      const head = await client.send(
        new HeadObjectCommand({ Bucket: bucket, Key: asset.key }),
      );
      if (
        head.ContentLength !== asset.bytes ||
        head.ContentType !== asset.contentType
      )
        throw new Error(
          "Uploaded file does not match its declared size or type.",
        );
      // Seal against later overwrites using the still-valid upload URL.
      const key = asset.sealedKey!;
      await client.send(
        new CopyObjectCommand({
          Bucket: bucket,
          Key: key,
          CopySource: `${bucket}/${asset.key}`,
          CopySourceIfMatch: head.ETag,
        }),
      );
      try {
        const sample = await client.send(
          new GetObjectCommand({
            Bucket: bucket,
            Key: key,
            Range: "bytes=0-262143",
          }),
        );
        const bytes = await sample.Body!.transformToByteArray();
        const detected = await fileTypeFromBuffer(bytes);
        if (!detected || detected.mime !== asset.contentType)
          throw new Error(
            "File contents do not match the selected media type.",
          );
        const metadata =
          asset.type === "video"
            ? await inspectVideo(key)
            : (() => {
                const size = imageSize(bytes);
                if (
                  !size.width ||
                  !size.height ||
                  size.width > 8192 ||
                  size.height > 8192
                )
                  throw new Error(
                    "Image dimensions must be at most 8,192 pixels.",
                  );
                return { width: size.width, height: size.height };
              })();
        const sealed = await ctx.runMutation(internal.media.seal, {
          assetId: asset._id,
          token,
          key,
          ...metadata,
        });
        if (!sealed)
          throw new Error("Upload verification could not complete. Try again.");
        await client
          .send(new DeleteObjectCommand({ Bucket: bucket, Key: asset.key }))
          .catch(() => {});
        return asset._id;
      } catch (error) {
        // A commit may have succeeded even if the response was interrupted.
        // Unregistered immutable copies are reclaimed through the durable garbage table.
        throw new Error(
          error instanceof Error &&
            /^(Use |Choose |File |Image )/.test(error.message)
            ? error.message
            : "Could not validate this media. Try an H.264 MP4 video or a supported image.",
        );
      }
    } finally {
      await ctx
        .runMutation(internal.media.releaseCompletion, {
          assetId: asset._id,
          token,
        })
        .catch(() => {});
    }
  },
});
export const preview = action({
  args: { assetId: v.id("mediaAssets"), download: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<string> => {
    const asset = await ctx.runQuery(internal.media.owned, {
      assetId: args.assetId,
    });
    if (asset.status !== "ready") throw new Error("Media is not ready.");
    return await readUrl(
      asset.key,
      args.download
        ? asset.name + (asset.type === "video" ? ".mp4" : "")
        : undefined,
    );
  },
});

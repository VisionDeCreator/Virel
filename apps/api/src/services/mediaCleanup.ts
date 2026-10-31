import { internalAction } from "../runtime/operation";
import { internal } from "../../../../packages/backend/convex/_generated/api";
import { storage, DeleteObjectCommand } from "./r2";
export const clean = internalAction({
  args: {},
  handler: async (ctx) => {
    const assets = await ctx.runQuery(internal.media.expiredUploads, {
      before: Date.now(),
    });

    const { client, bucket } = storage();
    const garbage = await ctx.runQuery(internal.media.garbage, {
      before: Date.now(),
    });
    for (const item of garbage) {
      await client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: item.key }),
      );
      await ctx.runMutation(internal.media.removeGarbage, { id: item._id });
    }
    for (const asset of assets) {
      await client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: asset.key }),
      );
      await ctx.runMutation(internal.media.markDeleted, { assetId: asset._id });
    }
  },
});

import type { StudioInput } from "@virel/shared";
import type { Id } from "@virel/backend";
export const serverInput = (input: StudioInput) => ({
  ...input,
  sourceAssetId: input.sourceAssetId as Id<"mediaAssets"> | undefined,
  sourceVideoId: input.sourceVideoId as Id<"videos"> | undefined,
  referenceVideoAssetId: input.referenceVideoAssetId as
    Id<"mediaAssets"> | undefined,
  referenceVideoId: input.referenceVideoId as Id<"videos"> | undefined,
  referenceAssetIds: input.referenceAssetIds as Id<"mediaAssets">[],
  referenceBindings: input.referenceBindings?.map((binding) => ({
    ...binding,
    assetId: binding.assetId as Id<"mediaAssets">,
  })),
  segmentId: input.segmentId as Id<"studioSegments"> | undefined,
});

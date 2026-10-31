export const transformTargets = [
  { value: "recast", label: "Characters" },
  { value: "restyle", label: "Visual style" },
  { value: "environment", label: "Environment" },
  { value: "wardrobe", label: "Clothing" },
  { value: "objects", label: "Objects & products" },
  { value: "lighting", label: "Lighting" },
] as const;
export type TransformTarget = (typeof transformTargets)[number]["value"];
export type StudioInput = {
  // Legacy values remain readable in immutable job snapshots.
  mode: "create" | "text" | "image" | "remix";
  referenceVideoAssetId?: string;
  referenceVideoId?: string;
  referenceBindings?: { alias: string; assetId: string }[];
  segmentId?: string;
  scriptVersion?: number;
  segmentTitle?: string;
  prompt: string;
  sourceAssetId?: string;
  sourceVideoId?: string;
  referenceAssetIds: string[];
  duration: number;
  resolution: "720p" | "1080p";
  aspectRatio: "9:16" | "16:9" | "1:1";
  targets: string[];
  preserveCamera: boolean;
  preserveMotion: boolean;
};
export const MAX_GENERATION_DURATION = 15;
export const generationDurations = Array.from(
  { length: MAX_GENERATION_DURATION - 3 },
  (_, i) => i + 4,
);
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const imageTypes = ["image/jpeg", "image/png", "image/webp"];
export const videoTypes = ["video/mp4", "video/quicktime", "video/webm"];
export function validateUpload(type: string, bytes: number) {
  const image = imageTypes.includes(type);
  if (!image && !videoTypes.includes(type))
    throw new Error("Choose a JPG, PNG, WebP, MP4, MOV, or WebM file.");
  if (
    !Number.isSafeInteger(bytes) ||
    bytes <= 0 ||
    bytes > (image ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES)
  )
    throw new Error(
      image ? "Images must be under 10 MB." : "Videos must be under 200 MB.",
    );
  return image ? ("image" as const) : ("video" as const);
}
export function validateStudioInput(input: StudioInput) {
  if (!["create", "text", "image", "remix"].includes(input.mode))
    throw new Error("Choose a creation mode.");
  if (!input.prompt.trim() || input.prompt.length > 4000)
    throw new Error("Write a prompt of 1–4,000 characters.");
  if (
    !["720p", "1080p"].includes(input.resolution) ||
    !["9:16", "16:9", "1:1"].includes(input.aspectRatio)
  )
    throw new Error("Choose supported output settings.");
  if (
    !Number.isInteger(input.duration) ||
    input.duration < 4 ||
    input.duration > MAX_GENERATION_DURATION
  )
    throw new Error("Use a duration between 4 and 15 seconds.");
  if (
    new Set(input.referenceAssetIds).size !== input.referenceAssetIds.length ||
    input.referenceAssetIds.length > referenceLimit(input.mode)
  )
    throw new Error(
      `Use up to ${referenceLimit(input.mode)} distinct reference images.`,
    );
  if (
    new Set(input.targets).size !== input.targets.length ||
    input.targets.some((t) => !transformTargets.some((o) => o.value === t))
  )
    throw new Error("Choose supported transformation targets.");
  if (input.mode === "remix" && !input.sourceAssetId && !input.sourceVideoId)
    throw new Error("Select a source video.");
  if (input.mode === "remix" && !input.referenceAssetIds.length)
    throw new Error("Add at least one reference image for Remix.");

  if (
    input.mode === "remix" &&
    (input.referenceVideoAssetId || input.referenceVideoId)
  )
    throw new Error("Use the source video input for Remix.");
  if (input.mode !== "remix" && (input.sourceAssetId || input.sourceVideoId))
    throw new Error("Source videos are only used in Remix mode.");
}
export function compileRemix(input: StudioInput) {
  const refs = scriptReferences(input);
  const prompt = input.prompt.replace(
    /(^|[^\w@])@([a-zA-Z][\w]*)\b/g,
    (_, prefix: string, alias: string) => {
      const ref = refs.find((ref) => ref.alias === alias);
      if (
        !ref &&
        (input.mode === "text" || input.mode === "image") &&
        !/^(image_\d+|video_1)$/.test(alias)
      )
        return `${prefix}@${alias}`;
      if (!ref)
        throw new Error(`Link missing reference @${alias} before generating.`);
      return `${prefix}${ref.type === "video" ? "video 1" : `image ${input.referenceAssetIds.indexOf(ref.assetId) + 1}`}`;
    },
  );
  if (input.mode !== "remix") return prompt;
  return [
    "Transform source video 1 using the requested changes and reference images. Apply all requested changes together.",
    `Requested changes: ${prompt}`,
    input.targets.length
      ? `Focus areas: ${input.targets.map((t) => transformTargets.find((o) => o.value === t)?.label).join(", ")}.`
      : "Infer changes from the user's prompt.",
    ...input.referenceAssetIds.map(
      (_, i) =>
        `Image ${i + 1} is a visual reference for the requested changes.`,
    ),
    input.preserveCamera
      ? "Follow source camera movement, framing, and shot transitions unless explicitly changed in the prompt."
      : "Adapt framing as needed.",
    input.preserveMotion
      ? "Preserve actions, motion, choreography, and timing unless explicitly changed in the prompt."
      : "Adapt movement as needed.",
    "Keep unrelated elements consistent across frames. Do not add captions or titles.",
  ].join("\n");
}
export const defaultStudioInput = {
  mode: "create",
  prompt: "",
  referenceAssetIds: [],
  duration: 5,
  resolution: "720p",
  aspectRatio: "9:16",
  targets: [],
  preserveCamera: true,
  preserveMotion: true,
} satisfies StudioInput;

export function referenceLimit(mode: StudioInput["mode"]) {
  return mode === "remix" ? 8 : 30;
}
export function scriptReferences(input: StudioInput) {
  const refs = input.referenceAssetIds.map((assetId, index) => ({
    assetId,
    type: "image" as "image" | "video",
    alias:
      input.referenceBindings?.find((b) => b.assetId === assetId)?.alias ??
      `image_${index + 1}`,
  }));
  const videoId =
    input.mode === "remix" ? input.sourceAssetId : input.referenceVideoAssetId;
  if (
    videoId ||
    (input.mode === "remix" ? input.sourceVideoId : input.referenceVideoId)
  )
    refs.push({
      assetId: videoId ?? "published-video",
      type: "video",
      alias:
        input.referenceBindings?.find((b) => b.assetId === videoId)?.alias ??
        "video_1",
    });
  if (
    new Set(refs.map((ref) => ref.alias)).size !== refs.length ||
    refs.some((ref) => !/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(ref.alias))
  )
    throw new Error(
      "Reference names must be unique and use letters, numbers, or underscores.",
    );
  return refs;
}
export function bindReference(
  input: StudioInput,
  assetId: string,
  type: "image" | "video",
): Partial<StudioInput> {
  const refs = scriptReferences(input);
  if (refs.some((ref) => ref.assetId === assetId)) return {};
  const occupied = new Set(refs.map((ref) => ref.alias));
  let n = 1;
  while (occupied.has(`${type}_${n}`)) n++;
  const referenceBindings = [
    ...refs
      .filter((ref) => ref.assetId !== "published-video")
      .map(({ alias, assetId }) => ({ alias, assetId })),
    { alias: `${type}_${n}`, assetId },
  ];
  if (type === "image")
    return {
      referenceAssetIds: [...input.referenceAssetIds, assetId],
      referenceBindings,
    };
  // One video reference per request. Removing/replacing it must be explicit.
  const existingVideo = refs.find((ref) => ref.type === "video");
  return {
    ...(input.mode === "remix"
      ? { sourceAssetId: assetId, sourceVideoId: undefined }
      : { referenceVideoAssetId: assetId, referenceVideoId: undefined }),
    referenceBindings: [
      ...referenceBindings.filter(
        (ref) => ref.assetId !== existingVideo?.assetId,
      ),
    ].map((ref) =>
      ref.assetId === assetId
        ? { ...ref, alias: existingVideo?.alias ?? "video_1" }
        : ref,
    ),
  };
}
export function removeReference(
  input: StudioInput,
  id: string,
): Partial<StudioInput> {
  const refs = scriptReferences(input);
  const removed = refs.find((ref) => ref.assetId === id);
  if (!removed) return {};
  return {
    referenceAssetIds: input.referenceAssetIds.filter((value) => value !== id),
    referenceBindings: refs
      .filter((ref) => ref.assetId !== id && ref.assetId !== "published-video")
      .map(({ alias, assetId }) => ({ alias, assetId })),
    ...(removed.type === "video"
      ? {
          sourceAssetId: undefined,
          sourceVideoId: undefined,
          referenceVideoAssetId: undefined,
          referenceVideoId: undefined,
        }
      : {}),
    prompt: replaceMention(
      input.prompt,
      removed.alias,
      `missing_${removed.alias}`,
    ),
  };
}
export function replaceMention(
  prompt: string,
  alias: string,
  replacement: string,
) {
  return prompt.replace(
    /(^|[^\w@])@([a-zA-Z][\w]*)\b/g,
    (match, prefix: string, name: string) =>
      name === alias ? `${prefix}@${replacement}` : match,
  );
}
export function renameReference(
  input: StudioInput,
  id: string,
  alias: string,
): Partial<StudioInput> {
  const refs = scriptReferences(input);
  const current = refs.find((ref) => ref.assetId === id);
  if (
    !current ||
    !/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(alias) ||
    refs.some((ref) => ref.assetId !== id && ref.alias === alias)
  )
    throw new Error(
      "Choose a unique reference name using letters, numbers, or underscores.",
    );
  return {
    referenceBindings: refs
      .filter((ref) => ref.assetId !== "published-video")
      .map((ref) => ({
        assetId: ref.assetId,
        alias: ref.assetId === id ? alias : ref.alias,
      })),
    prompt: replaceMention(input.prompt, current.alias, alias),
  };
}
export function replaceReference(
  input: StudioInput,
  id: string,
  replacementId: string,
): Partial<StudioInput> {
  const refs = scriptReferences(input);
  const ref = refs.find((ref) => ref.assetId === id);
  if (!ref || refs.some((ref) => ref.assetId === replacementId))
    throw new Error("Choose a reference that is not already in use.");
  return {
    referenceAssetIds: input.referenceAssetIds.map((value) =>
      value === id ? replacementId : value,
    ),
    referenceBindings: refs
      .filter((ref) => ref.assetId !== "published-video")
      .map((ref) => ({
        alias: ref.alias,
        assetId: ref.assetId === id ? replacementId : ref.assetId,
      })),
    ...(ref.type === "video"
      ? input.mode === "remix"
        ? { sourceAssetId: replacementId, sourceVideoId: undefined }
        : { referenceVideoAssetId: replacementId, referenceVideoId: undefined }
      : {}),
  };
}
export function normalizeStudioDraft(raw: Partial<StudioInput>): StudioInput {
  const merged = { ...defaultStudioInput, ...raw };
  if (merged.duration > MAX_GENERATION_DURATION)
    merged.duration = MAX_GENERATION_DURATION;
  if (merged.mode === "text" || merged.mode === "image") merged.mode = "create";
  if (merged.mode === "create" && merged.sourceAssetId) {
    merged.referenceVideoAssetId = merged.sourceAssetId;
    delete merged.sourceAssetId;
  }
  return merged;
}

import { useApiAction } from "./http";
import { useEffect, useRef, useState, useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@virel/backend";
import {
  defaultStudioInput,
  bindReference,
  normalizeStudioDraft,
  referenceLimit,
  validateStudioInput,
  validateUpload,
  type StudioInput,
  type PlatformBase,
  scriptReferences,
  replaceMention,
} from "@virel/shared";
import { serverInput } from "./studioInput";
import { useStudioScripts, type DraftStorage } from "./studioScripts";
export function useStudio(options: { draftStorage?: DraftStorage } = {}) {
  const [input, setInput] = useState<StudioInput>(defaultStudioInput);
  const storage =
    options.draftStorage ??
    (typeof localStorage !== "undefined" ? localStorage : undefined);
  const scripts = useStudioScripts(input, setInput, storage);
  const [pendingBase, setPendingBase] = useState<StudioInput | null>(null);
  useEffect(() => {
    if (
      !pendingBase ||
      input.mode !== pendingBase.mode ||
      !scripts.segmentId ||
      input.segmentId !== scripts.segmentId
    )
      return;
    const segment = scripts.segments?.find((s) => s._id === scripts.segmentId);
    if (!segment || segment.mode !== pendingBase.mode) return;
    setInput({
      ...pendingBase,
      segmentId: scripts.segmentId,
      scriptVersion: undefined,
    });
    setPendingBase(null);
  }, [
    pendingBase,
    input.mode,
    input.segmentId,
    scripts.segmentId,
    scripts.segments,
  ]);

  const [busy, setBusy] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{
    name: string;
    index: number;
    total: number;
    phase: "preparing" | "uploading" | "verifying";
    progress: number | null;
  } | null>(null);
  const locked = useRef(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const balance = useQuery(api.credits.balance);
  const pricingStatus = useQuery(api.creditPricing.status);
  const history = useQuery(api.credits.history);
  const assets = useQuery(api.media.list);
  const jobs = useQuery(api.generation.list);
  const initialize = useMutation(api.credits.initialize);
  const begin = useApiAction("mediaActions:beginUpload");
  const finish = useApiAction("mediaActions:finishUpload");
  const preview = useApiAction("mediaActions:preview");
  const getQuote = useApiAction("generationActions:quote");
  const start = useApiAction("generation:start");
  const publishAction = useApiAction("publishing:publish");
  const resume = useApiAction("generation:resume");
  const unpublish = useApiAction("generation:unpublish");
  const [quoted, setQuoted] = useState<{
    key: string;
    quoteId: Id<"generationQuotes">;
    credits: number;
    surchargeCredits: number;
    royaltyEligible: boolean;
    rewardMessage: string;
    expiresAt: number;
    duration: number;
  } | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!quoted) return;
    setNow(Date.now());
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.max(0, quoted.expiresAt - Date.now()) + 1,
    );
    return () => clearTimeout(timer);
  }, [quoted]);
  const key = useMemo(
    () =>
      JSON.stringify({
        input,
        title: scripts.title,
        segmentId: scripts.segmentId,
      }),
    [input, scripts.title, scripts.segmentId],
  );
  const quote = quoted?.key === key && quoted.expiresAt > now ? quoted : null;
  const request = useRef<{ quoteId: string; requestId: string } | null>(null);
  useEffect(() => {
    void initialize().catch(() =>
      setError("Could not initialize credits. Try reopening Studio."),
    );
  }, [initialize]);
  function change(patch: Partial<StudioInput>) {
    setInput((old) => ({ ...old, ...patch }));
    setError("");
  }
  async function run<T>(operation: () => Promise<T>): Promise<T | undefined> {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      return await operation();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
              .replace(/\[CONVEX[^]*?Uncaught Error: /, "")
              .split("\n")[0]
          : "Something went wrong. Try again.",
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  async function uploadFiles(
    files: { name: string; type: string; bytes: number }[],
    transfer: (
      url: string,
      index: number,
      onProgress: (percent: number) => void,
    ) => Promise<void>,
  ) {
    return await run(async () => {
      if (!files.length) return [];
      const kinds = files.map((file) => validateUpload(file.type, file.bytes));
      if (kinds.filter((kind) => kind === "video").length > 1)
        throw new Error("Choose one source video at a time.");
      if (
        input.referenceAssetIds.length +
          kinds.filter((kind) => kind === "image").length >
        referenceLimit(input.mode)
      )
        throw new Error(
          `Use up to ${referenceLimit(input.mode)} reference images. Remove an image before adding more.`,
        );
      const uploaded: string[] = [];
      try {
        for (const [index, file] of files.entries()) {
          const status = {
            name: file.name,
            index: index + 1,
            total: files.length,
            progress: null,
          };
          setUploadStatus({ ...status, phase: "preparing" });
          const { assetId, url } = await begin({
            name: file.name,
            contentType: file.type,
            bytes: file.bytes,
          });
          setUploadStatus({ ...status, phase: "uploading" });
          await transfer(url, index, (percent) => {
            if (!Number.isFinite(percent)) return;
            setUploadStatus((old) =>
              old?.index === index + 1 && old.phase === "uploading"
                ? {
                    ...old,
                    progress: Math.max(0, Math.min(100, Math.round(percent))),
                  }
                : old,
            );
          });
          setUploadStatus({ ...status, phase: "verifying" });
          await finish({ assetId: assetId as Id<"mediaAssets"> });
          // Functional updates preserve every successful image in a multi-file batch.
          setInput((old) => ({
            ...old,
            ...bindReference(old, assetId, kinds[index]),
          }));
          uploaded.push(assetId);
        }
        setMessage(
          `${uploaded.length === 1 ? "Upload" : "Uploads"} ready. Your media is stored privately.`,
        );
        return uploaded;
      } finally {
        setUploadStatus(null);
      }
    });
  }
  async function upload(
    file: { name: string; type: string; bytes: number },
    transfer: (url: string) => Promise<void>,
  ) {
    return (await uploadFiles([file], transfer))?.[0];
  }
  async function selectBase(base: PlatformBase | null) {
    return run(async () => {
      if (base && input.referenceAssetIds.length > 8)
        throw new Error(
          "Remove extra image references before remixing. Remixes support up to 8 images.",
        );
      const oldVideo = scriptReferences(input).find(
        (ref) => ref.type === "video",
      );
      let next: StudioInput = {
        ...input,
        mode: base ? "remix" : "create",
        sourceAssetId: undefined,
        sourceVideoId: undefined,
        referenceVideoAssetId: undefined,
        referenceVideoId: undefined,
        referenceBindings: input.referenceBindings?.filter((ref) =>
          input.referenceAssetIds.includes(ref.assetId),
        ),
      };
      if (base) {
        next = {
          ...next,
          ...bindReference(next, base.assetId, "video"),
          sourceVideoId: base.videoId,
          duration: Math.ceil(base.duration),
          aspectRatio: base.aspectRatio,
        };
        if (oldVideo)
          next.prompt = replaceMention(next.prompt, oldVideo.alias, "video_1");
      } else if (oldVideo)
        next.prompt = next.prompt.replace(
          /(^|[^\w@])@([a-zA-Z][\w]*)\b/g,
          (match, prefix: string, alias: string) =>
            alias === oldVideo.alias ? `${prefix}the video` : match,
        );
      await scripts.switchMode(base ? "remix" : "create");
      setPendingBase(next);
      setQuoted(null);
      setMessage(
        base
          ? `Remixing “${base.title}”. Review the changes and credit cost before generating.`
          : "Base removed. Review your description before creating a new video.",
      );
      return true;
    });
  }
  async function reviewCost() {
    return await run(async () => {
      validateStudioInput(input);
      const snapshot = await scripts.flush();
      const result = await getQuote({ input: serverInput(snapshot) });
      setQuoted({ ...result, key });
    });
  }
  async function generate(requestId: string) {
    return await run(async () => {
      if (!quote || quote.expiresAt <= Date.now())
        throw new Error("Review the credit cost before generating.");
      if (request.current?.quoteId !== quote.quoteId)
        request.current = { quoteId: quote.quoteId, requestId };
      const jobId = await start({
        quoteId: quote.quoteId,
        requestId: request.current.requestId,
      });
      setQuoted(null);
      setMessage(
        "Generation queued. You can leave Studio and return to your result.",
      );
      return jobId;
    });
  }
  async function publish(
    jobId: Id<"generationJobs">,
    title: string,
    description: string,
    remixEnabled: boolean,
  ) {
    return await run(async () => {
      const id = await publishAction({
        jobId,
        title,
        description,
        remixEnabled,
      });
      setMessage(
        "Published. Your video is now in the feed and on your profile.",
      );
      return id;
    });
  }
  function useVersion(job: NonNullable<typeof jobs>[number]) {
    if (!job.outputAssetId) return;
    const base = {
      ...normalizeStudioDraft(job.input),
      mode: input.mode,
      segmentId: input.segmentId,
      scriptVersion: undefined,
      segmentTitle: undefined,
    };
    change({ ...base, ...bindReference(base, job.outputAssetId, "video") });
    setQuoted(null);
    setMessage(
      input.mode === "remix"
        ? "This result is now your source. Describe the next changes; another render uses credits."
        : "This result is now an optional video reference. Describe your next creation; another render uses credits.",
    );
  }
  return {
    input,
    scripts,
    change,
    setInput,
    busy: busy || Boolean(pendingBase),
    selectBase,
    uploadStatus,
    error,
    setError,
    message,
    balance,
    pricingUpdating: pricingStatus?.updating ?? false,
    history,
    assets,
    jobs,
    quote,
    upload,
    uploadFiles,
    reviewCost,
    generate,
    publish,
    preview,
    run,
    resume,
    unpublish,
    useVersion,
  };
}

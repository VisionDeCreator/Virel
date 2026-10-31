import { useEffect, useRef, useState } from "react";
import { useSearchParams, NavLink } from "react-router-dom";
import {
  api,
  useQuery,
  useConvexAuth,
  useStudio,
  type Id,
} from "@virel/api-client";
import { Panel, Button, SegmentedControl, TextArea, Notice } from "@virel/ui";
import {
  creationModes,
  generationDurations,
  aspectRatios,
  transformTargets,
  normalizeStudioDraft,
  referenceLimit,
  bindReference,
  defaultStudioInput,
  type StudioInput,
} from "@virel/shared";
import { ScriptEditor } from "./ScriptEditor";
import { ReferenceLibrary } from "./ReferenceLibrary";
import { MediaDropzone } from "./MediaDropzone";
import { StudioPreview } from "./StudioPreview";
export function Studio({ connected }: { connected: boolean }) {
  return connected ? <ConnectedStudio /> : <StudioPreview connected={false} />;
}
function ConnectedStudio() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  if (isLoading) return <p role="status">Opening Studio…</p>;
  if (!isAuthenticated)
    return (
      <div className="studio-page">
        <h1>
          Make something <em>worth remixing.</em>
        </h1>
        <Notice>
          <NavLink to="/profile">Sign in or create an account</NavLink> to
          upload, generate, and publish videos.
        </Notice>
      </div>
    );
  return <Workspace />;
}
function Workspace() {
  const studio = useStudio();
  const { input, change, busy } = studio;
  const [params] = useSearchParams();
  const videoId = params.get("source");
  const source = useQuery(api.media.source, videoId ? { videoId } : "skip");
  const profile = useQuery(api.profiles.me);
  const importedDraft = useRef(false);
  useEffect(() => {
    const first = studio.scripts.segments?.[0];
    if (
      !profile ||
      !first ||
      importedDraft.current ||
      videoId ||
      first.revision !== 0
    )
      return;
    importedDraft.current = true;
    try {
      const saved = localStorage.getItem(`virel.studio.${profile._id}`);
      if (saved) {
        const draft = normalizeStudioDraft(JSON.parse(saved));
        if (draft.mode === input.mode)
          studio.setInput({ ...draft, segmentId: first._id });
      }
    } catch {
      /* Invalid old local drafts do not replace server scripts. */
    }
  }, [profile?._id, studio.scripts.segmentId]);
  const appliedSource = useRef("");
  useEffect(() => {
    if (
      !videoId ||
      !source ||
      !studio.scripts.segmentId ||
      appliedSource.current === videoId
    )
      return;
    if (input.mode !== "remix") {
      void studio.run(() => studio.scripts.switchMode("remix"));
      return;
    }
    appliedSource.current = videoId;
    change({ sourceVideoId: videoId, sourceAssetId: undefined });
  }, [videoId, source?._id, input.mode, studio.scripts.segmentId]);
  const [selectedJob, setSelectedJob] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(false);
  const visibleJobs = studio.jobs?.filter(
    (job) =>
      (job.input.mode === "remix" ? "remix" : "create") === input.mode &&
      (!job.input.segmentId ||
        job.input.segmentId === studio.scripts.segmentId),
  );
  const activeJob =
    visibleJobs?.find((j) => j._id === selectedJob) ??
    visibleJobs?.find((j) => j.outputAssetId);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewError, setPreviewError] = useState("");
  const previewAsset = showSource
    ? (input.sourceAssetId ?? input.referenceVideoAssetId)
    : (activeJob?.outputAssetId ??
      input.sourceAssetId ??
      input.referenceVideoAssetId);
  useEffect(() => {
    let live = true;
    setPreviewUrl("");
    setPreviewError("");
    const refresh = () => {
      if (previewAsset)
        void studio
          .preview({ assetId: previewAsset as Id<"mediaAssets"> })
          .then((url) => {
            if (live) setPreviewUrl(url);
          })
          .catch(() => {
            if (live)
              setPreviewError(
                "Preview unavailable. Select the version again to retry.",
              );
          });
    };
    refresh();
    const timer = setInterval(refresh, 45 * 60000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [previewAsset, studio.preview]);
  const sourceAsset = studio.assets?.find(
    (a) => a._id === (input.sourceAssetId ?? input.referenceVideoAssetId),
  );
  async function upload(files: File[]) {
    setShowSource(true);
    await studio.uploadFiles(
      files.map((file) => ({
        name: file.name,
        type: file.type,
        bytes: file.size,
      })),
      (url, index, onProgress) =>
        new Promise<void>((resolve, reject) => {
          const file = files[index];
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", url);
          xhr.setRequestHeader("Content-Type", file.type);
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) onProgress((e.loaded / e.total) * 100);
          };
          xhr.onload = () =>
            xhr.status >= 200 && xhr.status < 300
              ? resolve()
              : reject(
                  new Error(
                    "Upload failed. Check R2 browser CORS settings and retry.",
                  ),
                );
          xhr.onerror = () =>
            reject(
              new Error("Upload interrupted. Check your connection and retry."),
            );
          xhr.timeout = 10 * 60000;
          xhr.ontimeout = () =>
            reject(new Error("Upload timed out. Try again."));
          xhr.send(file);
        }),
    );
  }
  return (
    <div className="studio-page">
      <div className="studio-heading">
        <span className="eyebrow">YOUR STUDIO</span>
        <h1>
          Make something <em>worth remixing.</em>
        </h1>
        <p>Upload. Reimagine. Make it yours.</p>
      </div>
      <div className="credit-summary" aria-live="polite">
        <strong>{studio.balance?.available ?? 0} credits available</strong>
        <span>{studio.balance?.reserved ?? 0} reserved for running videos</span>
      </div>
      <div className="studio-workspace">
        <Panel className="studio-controls">
          <fieldset disabled={busy} className="studio-fields">
            <SegmentedControl
              label="Creation mode"
              options={creationModes}
              value={input.mode === "remix" ? "remix" : "create"}
              onChange={(mode) =>
                void studio.run(() => studio.scripts.switchMode(mode))
              }
            />
            <Notice>
              Generated videos:{" "}
              <strong>4–15 seconds · 15-second maximum.</strong> New Create
              videos fit the Remix duration limit.
            </Notice>
            <MediaDropzone
              uploading={Boolean(studio.uploadStatus)}
              kind="media"
              label={
                input.mode === "remix"
                  ? "Upload source video and reference images"
                  : "Upload optional images or video"
              }
              description={
                input.mode === "remix"
                  ? "Required source: 4–15s, up to 200 MB. Up to 8 images, 10 MB each."
                  : "Optional reference input: one video (4–15s, up to 200 MB) and up to 30 images (10 MB each). Generated output: 15 seconds maximum."
              }
              disabled={busy}
              onFiles={upload}
            />
            {studio.uploadStatus && (
              <div className="studio-upload-status" aria-busy="true">
                <div className="studio-upload-heading" role="status">
                  <span className="studio-upload-spinner" aria-hidden="true" />
                  <strong>
                    {studio.uploadStatus.phase === "preparing"
                      ? "Preparing upload…"
                      : studio.uploadStatus.phase === "verifying"
                        ? "Checking your media…"
                        : "Uploading media…"}
                  </strong>
                </div>
                <span className="studio-upload-filename">
                  {studio.uploadStatus.name}
                </span>
                <small>
                  File {studio.uploadStatus.index} of{" "}
                  {studio.uploadStatus.total}
                  {studio.uploadStatus.phase === "uploading" &&
                  studio.uploadStatus.progress !== null
                    ? ` · ${studio.uploadStatus.progress}%`
                    : ""}
                </small>
                <progress
                  aria-label="Media upload progress"
                  max={100}
                  value={
                    studio.uploadStatus.phase === "uploading"
                      ? (studio.uploadStatus.progress ?? undefined)
                      : undefined
                  }
                />
                {studio.uploadStatus.phase === "verifying" && (
                  <small>
                    Upload complete. Checking the file before adding it to your
                    references.
                  </small>
                )}
              </div>
            )}
            {(input.mode === "remix" || input.mode === "create") && (
              <div className="field">
                <strong>
                  {input.mode === "remix"
                    ? "Source video · required"
                    : "Reference video · optional"}
                </strong>
                <p>
                  {input.mode === "remix"
                    ? "Select the video whose motion and timing you want to remix."
                    : "Optionally choose video guidance for a new Seedance generation."}{" "}
                  Add reference images below to guide the changes.
                </p>
                <select
                  aria-label={
                    input.mode === "remix"
                      ? "Saved source video"
                      : "Saved reference video"
                  }
                  value={
                    (input.mode === "remix"
                      ? input.sourceAssetId
                      : input.referenceVideoAssetId) ?? ""
                  }
                  onChange={(event) => {
                    if (event.target.value) {
                      change(bindReference(input, event.target.value, "video"));
                      setShowSource(true);
                    } else
                      change(
                        input.mode === "remix"
                          ? {
                              sourceAssetId: undefined,
                              sourceVideoId: undefined,
                            }
                          : {
                              referenceVideoAssetId: undefined,
                              referenceVideoId: undefined,
                            },
                      );
                  }}
                >
                  <option value="">Choose an uploaded video</option>
                  {studio.assets
                    ?.filter((a) => a.type === "video")
                    .map((a) => (
                      <option key={a._id} value={a._id}>
                        {a.name}
                      </option>
                    ))}
                </select>
                <small>
                  {input.mode === "remix"
                    ? "4–15 seconds"
                    : "Optional reference: 4–15 seconds"}{" "}
                  · up to 200 MB · H.264 video
                </small>
                {input.sourceVideoId && source && (
                  <p>
                    Remixing “{source.title}” by @
                    {source.creator?.username ?? "creator"}. Attribution stays
                    attached.
                  </p>
                )}
                {videoId && source === null && (
                  <Notice error>
                    This source is no longer available for remixing.
                  </Notice>
                )}
                {sourceAsset && (
                  <p>
                    Source: {sourceAsset.name} ·{" "}
                    {sourceAsset.duration?.toFixed(1)}s
                  </p>
                )}
              </div>
            )}
            <MediaDropzone
              uploading={Boolean(studio.uploadStatus)}
              kind="image"
              label={
                input.mode === "create"
                  ? "Upload reference images · optional"
                  : "Upload reference images"
              }
              description={`Up to ${referenceLimit(input.mode)} images · 10 MB each · type @ in the script to link references`}
              disabled={
                busy ||
                input.referenceAssetIds.length >= referenceLimit(input.mode)
              }
              onFiles={upload}
            />
            <ReferenceLibrary studio={studio} />
            <ScriptEditor studio={studio} onFiles={upload} />
            {input.mode === "remix" && (
              <>
                <div
                  className="transform-options"
                  role="group"
                  aria-label="What to change"
                >
                  {transformTargets.map((t) => (
                    <label key={t.value}>
                      <input
                        type="checkbox"
                        checked={input.targets.includes(t.value)}
                        onChange={(e) =>
                          change({
                            targets: e.target.checked
                              ? [...input.targets, t.value]
                              : input.targets.filter((v) => v !== t.value),
                          })
                        }
                      />
                      {t.label}
                    </label>
                  ))}
                </div>
                <label>
                  <input
                    type="checkbox"
                    checked={input.preserveCamera}
                    onChange={(e) =>
                      change({ preserveCamera: e.target.checked })
                    }
                  />{" "}
                  Follow source camera
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={input.preserveMotion}
                    onChange={(e) =>
                      change({ preserveMotion: e.target.checked })
                    }
                  />{" "}
                  Follow source motion and timing
                </label>
                <small>
                  Remix follows the source duration and aspect ratio.
                  Preservation guides the AI; it is not an exact pixel lock.
                </small>
              </>
            )}
            <div className="settings-row">
              <div className="field">
                <p>
                  Model:{" "}
                  {input.mode === "remix" ? "Remix Lite" : "Seedance 2.5"}
                </p>
                <label htmlFor="resolution">Resolution</label>
                <select
                  id="resolution"
                  value={input.resolution}
                  onChange={(e) =>
                    change({
                      resolution: e.target.value as StudioInput["resolution"],
                    })
                  }
                >
                  <option>720p</option>
                  <option>1080p</option>
                </select>
              </div>
              {input.mode !== "remix" && (
                <>
                  <div className="field">
                    <label htmlFor="duration">Duration</label>
                    <select
                      id="duration"
                      aria-describedby="duration-limit"
                      value={input.duration}
                      onChange={(e) =>
                        change({ duration: Number(e.target.value) })
                      }
                    >
                      {generationDurations.map((d) => (
                        <option key={d} value={d}>
                          {d} seconds
                        </option>
                      ))}
                    </select>
                    <small id="duration-limit">
                      Maximum 15 seconds, so your creation can be used in Remix.
                    </small>
                  </div>
                  <div className="field">
                    <label htmlFor="aspect-ratio">Aspect ratio</label>
                    <select
                      id="aspect-ratio"
                      value={input.aspectRatio}
                      onChange={(e) =>
                        change({
                          aspectRatio: e.target
                            .value as StudioInput["aspectRatio"],
                        })
                      }
                    >
                      {aspectRatios.map((a) => (
                        <option key={a.value}>{a.value}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </div>
          </fieldset>
          {busy && !studio.uploadStatus && <p role="status">Working…</p>}
          {studio.quote ? (
            <>
              <Notice>
                {studio.quote.duration}s video · {studio.quote.credits} credits.
                Reserved when you create; spent when your result is ready.
                Promotional funding does not earn creator royalties.
              </Notice>
              <Button
                variant="primary"
                disabled={
                  busy ||
                  (studio.balance?.available ?? 0) < studio.quote.credits
                }
                onClick={() => void studio.generate(crypto.randomUUID())}
              >
                Create video · {studio.quote.credits} credits
              </Button>
              {(studio.balance?.available ?? 0) < studio.quote.credits && (
                <Notice error>
                  Not enough credits. Paid top-ups are not available yet.
                </Notice>
              )}
            </>
          ) : (
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => void studio.reviewCost()}
            >
              Review credit cost
            </Button>
          )}
          {studio.error && <Notice error>{studio.error}</Notice>}
          {studio.message && <p role="status">{studio.message}</p>}
        </Panel>
        <div className="studio-results">
          <Panel>
            <h2>Private preview</h2>
            {previewUrl ? (
              <video
                key={previewAsset}
                className="result-video"
                src={previewUrl}
                controls
                playsInline
                preload="metadata"
              />
            ) : input.sourceVideoId && source ? (
              <video
                className="result-video"
                src={source.playbackUrl}
                controls
                playsInline
              />
            ) : (
              <div className="result-placeholder">
                Your next version starts here.
              </div>
            )}
            {previewError && <Notice error>{previewError}</Notice>}
            {!showSource && activeJob?.outputAssetId && (
              <>
                <p>{activeJob.input.prompt}</p>
                <div className="result-actions">
                  <Button
                    disabled={busy}
                    onClick={() => {
                      studio.useVersion(activeJob);
                      setShowSource(true);
                    }}
                  >
                    {input.mode === "remix"
                      ? "Edit this video with AI"
                      : "Use this video as a reference"}
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void studio.run(async () => {
                        const url = await studio.preview({
                          assetId: activeJob.outputAssetId!,
                          download: true,
                        });
                        const a = document.createElement("a");
                        a.href = url;
                        a.rel = "noopener";
                        a.click();
                      })
                    }
                  >
                    Download video
                  </Button>
                </div>
                <PublishForm
                  key={activeJob._id}
                  job={activeJob}
                  studio={studio}
                />
              </>
            )}
          </Panel>
          <Panel>
            <h2>Your versions</h2>
            {!studio.jobs?.length && (
              <p>Generated videos and running jobs appear here.</p>
            )}
            {visibleJobs?.map((job) => (
              <div className="version-card" key={job._id}>
                <button
                  className="version-select"
                  onClick={() => {
                    setSelectedJob(job._id);
                    setShowSource(false);
                  }}
                >
                  {job.input.prompt.slice(0, 80) || "Video"}
                </button>
                <span>
                  {job.status.replaceAll("_", " ")} · {job.credits} credits{" "}
                  {job.financialState === "released"
                    ? "returned"
                    : job.financialState}
                </span>
                {job.video?.status === "published" && (
                  <span className="status">Published</span>
                )}
                {job.error && <p>{job.error}</p>}
                {job.providerJobId &&
                  job.status === "reconciliation_required" && (
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void studio.run(() => studio.resume({ jobId: job._id }))
                      }
                    >
                      Check again
                    </Button>
                  )}
              </div>
            ))}
          </Panel>
        </div>
      </div>
      <Panel>
        <h2>Credit activity</h2>
        {!studio.history?.length && (
          <p>
            Your credit activity will appear here. Credits are required to
            generate videos.
          </p>
        )}
        {studio.history?.map((event) => (
          <div className="credit-row" key={event._id}>
            <span>{event.note}</span>
            <strong>
              {event.amount > 0 ? "+" : ""}
              {event.amount} credits
            </strong>
          </div>
        ))}
      </Panel>
    </div>
  );
}
function PublishForm({
  job,
  studio,
}: {
  job: NonNullable<ReturnType<typeof useStudio>["jobs"]>[number];
  studio: ReturnType<typeof useStudio>;
}) {
  const [title, setTitle] = useState(job.video?.title ?? "");
  const [description, setDescription] = useState(job.video?.description ?? "");
  const [remixEnabled, setRemixEnabled] = useState(
    job.video?.remixEnabled ?? true,
  );
  return (
    <fieldset className="publish-form studio-fields" disabled={studio.busy}>
      <h3>
        {job.video?.status === "published"
          ? "Publication settings"
          : "Ready to share?"}
      </h3>
      <label>
        Title
        <input
          value={title}
          maxLength={100}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <TextArea
        label="Description"
        value={description}
        rows={2}
        maxLength={2000}
        onChange={(e) => setDescription(e.target.value)}
      />
      <label>
        <input
          type="checkbox"
          checked={remixEnabled}
          onChange={(e) => setRemixEnabled(e.target.checked)}
        />{" "}
        Allow others to remix this video
      </label>
      <Button
        disabled={studio.busy || !title.trim()}
        variant="primary"
        onClick={() =>
          void studio.publish(job._id, title, description, remixEnabled)
        }
      >
        {job.video?.status === "published"
          ? "Update publication"
          : "Publish video"}
      </Button>
      {job.video?.status === "published" && (
        <Button
          disabled={studio.busy}
          onClick={() =>
            void studio.run(() => studio.unpublish({ jobId: job._id }))
          }
        >
          Unpublish video
        </Button>
      )}
      <small>
        Publishing makes this video public in the feed and on your profile.
        Unpublishing blocks new playback links and remixes; existing signed
        links expire within five minutes.
      </small>
    </fieldset>
  );
}

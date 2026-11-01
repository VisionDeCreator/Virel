import { StartingPoint } from "./StartingPoint";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, useQuery, useStudio } from "@virel/api-client";
import { Panel, Button, SegmentedControl, TextArea, Notice } from "@virel/ui";
import {
  generationDurations,
  aspectRatios,
  transformTargets,
  normalizeStudioDraft,
  type StudioInput,
  bindReference,
} from "@virel/shared";
import { ScriptEditor } from "./ScriptEditor";
import { ReferenceLibrary } from "./ReferenceLibrary";
import { MediaDropzone } from "./MediaDropzone";
export function StudioEditor({
  studio,
  onGenerated,
}: {
  studio: ReturnType<typeof useStudio>;
  onGenerated: (id: string) => void;
}) {
  const { input, change, busy } = studio;
  const [params] = useSearchParams();
  const videoId = params.get("source");
  const source = useQuery(api.media.base, videoId ? { videoId } : "skip");
  const profile = useQuery(api.profiles.me);
  const asset = params.get("asset");
  const retryId = params.get("retry");
  const retryJob = useQuery(
    api.generation.detail,
    retryId ? { jobId: retryId } : "skip",
  );
  const importedEntry = useRef("");
  useEffect(() => {
    const key = asset || retryId;
    if (!key || importedEntry.current === key || (retryId && !retryJob)) return;
    const mode = asset
      ? "remix"
      : retryJob!.input.mode === "remix"
        ? "remix"
        : "create";
    if (input.mode !== mode) {
      if (!busy) void studio.run(() => studio.scripts.switchMode(mode));
      return;
    }
    const segment = studio.scripts.segments?.find(
      (s) => s._id === studio.scripts.segmentId,
    );
    if (!segment || segment.mode !== mode || input.segmentId !== segment._id)
      return;
    importedEntry.current = key;
    if (asset)
      change({
        ...bindReference(input, asset, "video"),
        sourceVideoId: undefined,
      });
    else
      change({
        ...normalizeStudioDraft(retryJob!.input),
        segmentId: segment._id,
        scriptVersion: undefined,
      });
  }, [
    asset,
    retryId,
    retryJob,
    input.mode,
    input.segmentId,
    studio.scripts.segmentId,
    busy,
  ]);
  const importedDraft = useRef(false);
  useEffect(() => {
    const first = studio.scripts.segments?.[0];
    if (
      !profile ||
      !first ||
      importedDraft.current ||
      asset ||
      retryId ||
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
      busy ||
      !studio.scripts.segmentId ||
      appliedSource.current === videoId
    )
      return;
    appliedSource.current = videoId;
    void studio.selectBase(source);
  }, [videoId, source, busy, studio.scripts.segmentId]);
  async function upload(files: File[]) {
    if (files.some((file) => !file.type.startsWith("image/"))) {
      studio.setError(
        "Upload images here. Choose an existing platform video in Starting point to remix.",
      );
      return;
    }
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
              : reject(new Error("Upload failed. Please try again."));
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
        <h1>Create a video</h1>
        <p>Start with an idea. Make it yours.</p>
      </div>
      <div className="credit-summary" aria-live="polite">
        <strong>
          {(studio.balance?.available ?? 0).toLocaleString()} credits available
        </strong>
        <span>{studio.balance?.reserved ?? 0} reserved for running videos</span>
      </div>
      <div className="studio-workspace">
        <Panel className="studio-controls">
          <fieldset disabled={busy} className="studio-fields">
            <StartingPoint studio={studio} />
            <ScriptEditor studio={studio} onFiles={upload} />
            <details
              key={input.mode}
              className="reference-section"
              open={input.mode === "remix" || undefined}
            >
              <summary>
                References{" "}
                <span>
                  {input.mode === "remix"
                    ? "1–8 image references required for this remix model"
                    : "Optional image references"}
                </span>
              </summary>
              <MediaDropzone
                uploading={Boolean(studio.uploadStatus)}
                kind="image"
                label="Upload reference images"
                description={
                  input.mode === "remix"
                    ? "1–8 images · 10 MB each · JPG, PNG, or WebP"
                    : "Optional images · up to 30 · 10 MB each · JPG, PNG, or WebP"
                }
                disabled={busy}
                onFiles={upload}
              />
              {studio.uploadStatus && (
                <div className="studio-upload-status" aria-busy="true">
                  <div className="studio-upload-heading" role="status">
                    <span
                      className="studio-upload-spinner"
                      aria-hidden="true"
                    />
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
                      Upload complete. Checking the file before adding it to
                      your references.
                    </small>
                  )}
                </div>
              )}
              <ReferenceLibrary studio={studio} />
            </details>
            {input.mode === "remix" && (
              <details className="advanced-settings">
                <summary>Advanced remix settings</summary>
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
              </details>
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
          <p className="generation-expectation">
            Generation can take several minutes, sometimes longer than 5
            minutes. Your video starts private.
          </p>
          {input.mode === "remix" && (
            <p className="generation-expectation">
              {input.duration}s · {input.aspectRatio} · From base video
            </p>
          )}
          {busy && !studio.uploadStatus && <p role="status">Working…</p>}
          {studio.quote ? (
            <>
              <Notice>
                {studio.quote.duration}s video ·{" "}
                {studio.quote.credits.toLocaleString()} credits. Reserved when
                you create; spent when your result is ready.
              </Notice>
              <p>
                Available after starting:{" "}
                {Math.max(
                  0,
                  (studio.balance?.available ?? 0) - studio.quote.credits,
                ).toLocaleString()}{" "}
                credits. Quote expires at{" "}
                {new Date(studio.quote.expiresAt).toLocaleTimeString()}.
              </p>
              <Button
                variant="primary"
                disabled={
                  busy ||
                  (studio.balance?.available ?? 0) < studio.quote.credits
                }
                onClick={() =>
                  void studio.generate(crypto.randomUUID()).then((id) => {
                    if (id) onGenerated(id);
                  })
                }
              >
                {input.mode === "remix" ? "Remix video" : "Create video"} ·{" "}
                {studio.quote.credits.toLocaleString()} credits
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
              disabled={busy || studio.pricingUpdating}
              onClick={() => void studio.reviewCost()}
            >
              {studio.pricingUpdating
                ? "Updating credit pricing…"
                : input.mode === "remix"
                  ? "Review remix cost"
                  : "Review credit cost"}
            </Button>
          )}
          {studio.error && <Notice error>{studio.error}</Notice>}
          {studio.message && <p role="status">{studio.message}</p>}
        </Panel>
        <aside className="creation-guidance panel">
          <span className="eyebrow">FROM IDEA TO VIDEO</span>
          <h2>A little detail goes a long way.</h2>
          <p>
            Describe the subject, action, setting, camera movement, and sound.
          </p>
          <p>
            References can guide a character, look, or scene. Add them when they
            help explain your idea.
          </p>
          <hr />
          <strong>Your video starts private.</strong>
          <p>You choose whether to publish it after it is ready.</p>
          <p>
            This can take several minutes, sometimes longer than 5 minutes. You
            can leave and return to your creations.
          </p>
        </aside>
      </div>
    </div>
  );
}

export function PublishForm({
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

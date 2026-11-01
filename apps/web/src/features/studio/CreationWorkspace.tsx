import { useEffect, useRef, useState } from "react";
import { useSearchParams, NavLink } from "react-router-dom";
import {
  ArrowLeft,
  Plus,
  Film,
  Download,
  Sparkles,
  Clock,
  Check,
  Lock,
  Globe,
  LoaderCircle,
} from "lucide-react";
import { api, useQuery, usePaginatedQuery, useStudio } from "@virel/api-client";
import { Button, Notice, SegmentedControl } from "@virel/ui";
import {
  creationFilters,
  elapsedTime,
  generationInProgress,
  generationStatus,
  generationWaitMessage,
  type CreationFilter,
} from "@virel/shared";
import { StudioEditor, PublishForm } from "./StudioEditor";
type Studio = ReturnType<typeof useStudio>;
type Job = NonNullable<Studio["jobs"]>[number];

export function CreationWorkspace() {
  const studio = useStudio();
  const [params, setParams] = useSearchParams();
  const jobId = params.get("job");
  const editing = params.get("view") === "new" || Boolean(params.get("source"));
  const title = useRef<HTMLDivElement>(null);
  useEffect(() => {
    title.current?.focus();
    window.scrollTo(0, 0);
  }, [jobId, editing]);
  function library() {
    setParams({});
  }
  function details(id: string) {
    setParams({ job: id });
  }
  return (
    <div ref={title} tabIndex={-1} className="creation-root">
      {(jobId || editing) && (
        <Button variant="ghost" onClick={library}>
          <ArrowLeft size={17} /> Your creations
        </Button>
      )}
      {jobId ? (
        <VideoDetails
          key={jobId}
          id={jobId}
          studio={studio}
          onLibrary={library}
          onEdit={(job) => setParams({ view: "new", retry: job._id })}
          onRemix={(job) =>
            setParams({ view: "new", asset: job.outputAssetId! })
          }
        />
      ) : editing ? (
        <StudioEditor studio={studio} onGenerated={details} />
      ) : (
        <CreationLibrary
          studio={studio}
          onCreate={() => setParams({ view: "new" })}
          onSelect={details}
        />
      )}
    </div>
  );
}

function CreationLibrary({
  studio,
  onCreate,
  onSelect,
}: {
  studio: Studio;
  onCreate: () => void;
  onSelect: (id: string) => void;
}) {
  const [filter, setFilter] = useState<CreationFilter>("ready");
  const { results, status, loadMore } = usePaginatedQuery(
    api.generation.library,
    { filter },
    { initialNumItems: 12 },
  );
  const running =
    studio.jobs?.filter((job) => generationInProgress(job.status)) ?? [];
  return (
    <section className="creations-page">
      <div className="creations-heading">
        <div>
          <span className="eyebrow">YOUR STUDIO</span>
          <h1>Your creations</h1>
          <p>Every idea, all in one place.</p>
        </div>
        <NavLink className="text-link" to="/settings?tab=credits">
          Settings
        </NavLink>
        <span className="status">
          {studio.balance
            ? `${studio.balance.available.toLocaleString()} credits`
            : "Loading balance…"}
        </span>
      </div>
      {running.length > 0 && (
        <button
          className="generation-banner"
          onClick={() => {
            setFilter("progress");
          }}
        >
          <LoaderCircle size={20} className="generation-spinner" />
          <span>
            Videos in progress <small>{generationWaitMessage}</small>
          </span>
          <span>View progress →</span>
        </button>
      )}
      {studio.error && <Notice error>{studio.error}</Notice>}
      <SegmentedControl
        label="Filter creations"
        options={creationFilters}
        value={filter}
        onChange={setFilter}
      />
      <div className="creation-grid">
        <button className="creation-new" onClick={onCreate}>
          <span>
            <Plus size={28} />
          </span>
          <strong>Create a video</strong>
          <small>Start a new idea or remix</small>
        </button>
        {results.map((job) => (
          <button
            className="creation-card"
            key={job._id}
            onClick={() => onSelect(job._id)}
          >
            <div className="creation-cover">
              <CreationCover job={job} studio={studio} />
              <span
                className={`creation-badge ${job.status === "succeeded" ? "is-ready" : ""}`}
              >
                {generationStatus(job.status)}
              </span>
            </div>
            <strong>
              {job.video?.title ||
                job.input.prompt.slice(0, 65) ||
                "Untitled video"}
            </strong>
            <small>
              {job.input.duration}s · {job.input.aspectRatio} ·{" "}
              {job.input.resolution}
            </small>
            <small>
              {new Date(job._creationTime).toLocaleDateString()} ·{" "}
              {job.video?.status === "published" ? "Published" : "Private"}
            </small>
          </button>
        ))}
        {status === "LoadingFirstPage" && (
          <p role="status">Loading your creations…</p>
        )}
      </div>
      {status !== "LoadingFirstPage" && !results.length && (
        <div className="creation-empty">
          <Film size={32} />
          <h2>
            {filter === "all"
              ? "Your first idea starts here."
              : "No videos in this view."}
          </h2>
          <p>
            {filter === "all"
              ? "Create a video above. It will stay private until you choose to publish it."
              : "Choose another filter or start a new video."}
          </p>
        </div>
      )}
      {status === "CanLoadMore" && (
        <Button onClick={() => loadMore(12)}>Load more creations</Button>
      )}
      {status === "LoadingMore" && <p role="status">Loading more creations…</p>}
    </section>
  );
}

function CreationCover({ job, studio }: { job: Job; studio: Studio }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let live = true;
    if (job.outputAssetId)
      void studio
        .preview({ assetId: job.outputAssetId })
        .then((url) => {
          if (live) setUrl(url);
        })
        .catch(() => {});
    return () => {
      live = false;
    };
  }, [job.outputAssetId, studio.preview]);
  return url ? (
    <video
      src={`${url}#t=0.001`}
      muted
      playsInline
      preload="metadata"
      aria-hidden="true"
      onError={() => setUrl("")}
    />
  ) : (
    <div className="creation-cover-placeholder">
      <Film size={35} />
      <span>
        {generationInProgress(job.status) ? "Creating your video" : "Video"}
      </span>
    </div>
  );
}

function VideoDetails({
  id,
  studio,
  onLibrary,
  onRemix,
  onEdit,
}: {
  id: string;
  studio: Studio;
  onLibrary: () => void;
  onRemix: (job: Job) => void;
  onEdit: (job: Job) => void;
}) {
  const job = useQuery(api.generation.detail, { jobId: id });
  const [url, setUrl] = useState("");
  const [previewError, setPreviewError] = useState("");
  const playbackRetried = useRef(false);
  const [retry, setRetry] = useState(0);
  const [publishing, setPublishing] = useState(false);
  const [now, setNow] = useState(Date.now());
  const running = job && generationInProgress(job.status);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);
  useEffect(() => {
    let live = true;
    setUrl("");
    setPreviewError("");
    let recovery: ReturnType<typeof setTimeout> | undefined;
    function refresh(recover = true) {
      if (job?.outputAssetId)
        void studio
          .preview({ assetId: job.outputAssetId })
          .then((url) => {
            if (live) {
              setUrl(url);
              setPreviewError("");
            }
          })
          .catch((error) => {
            if (!live) return;
            if (recover) {
              recovery = setTimeout(() => refresh(false), 1000);
              return;
            }
            const message = error instanceof Error ? error.message : "";
            setPreviewError(
              /sign in|session|authenticat/i.test(message)
                ? "Your session needs refreshing. Sign in again, then reopen this video."
                : /not configured/i.test(message)
                  ? "Video previews are not connected. Check the Studio API connection."
                  : "We couldn’t load the preview link. Please retry; your video is saved.",
            );
          });
    }
    refresh();
    const timer = setInterval(refresh, 45 * 60000);
    return () => {
      live = false;
      clearInterval(timer);
      clearTimeout(recovery);
    };
  }, [job?.outputAssetId, studio.preview, retry]);
  if (job === undefined) return <p role="status">Opening your video…</p>;
  if (!job)
    return (
      <section className="creation-empty">
        <h1>Video unavailable</h1>
        <p>This video could not be found in your library.</p>
        <Button onClick={onLibrary}>Back to your creations</Button>
      </section>
    );
  const title =
    job.video?.title || job.input.prompt.slice(0, 65) || "Untitled video";
  return (
    <section className="creation-details">
      <div className="creations-heading">
        <h1>{running ? "Creating your video" : title}</h1>
        <span className="status">
          {job.video?.status === "published" ? (
            <Globe size={15} />
          ) : (
            <Lock size={15} />
          )}
          {job.video?.status === "published" ? "Published" : "Private"}
        </span>
      </div>
      <div className="creation-detail-grid">
        <div>
          {running ? (
            <div className="generation-panel">
              <div role="status" aria-live="polite">
                <LoaderCircle className="generation-spinner" size={48} />
                <h2>{generationStatus(job.status)}</h2>
                <p>
                  {job.status === "reconciliation_required"
                    ? "We’re checking with the video provider. Your result is not confirmed yet. Check the status before starting another generation."
                    : generationWaitMessage}
                </p>
              </div>
              <span className="elapsed">
                <Clock size={16} /> Elapsed{" "}
                {elapsedTime(job._creationTime, now)}
              </span>
              <p>
                You can leave this screen and return to your creations.
                Generation continues in the background.
              </p>
              <ol className="generation-steps" aria-label="Generation stages">
                <li>
                  <Check size={16} />
                  Submitted
                </li>
                <li aria-current="step">
                  {job.status === "queued"
                    ? "Queued"
                    : generationStatus(job.status)}
                </li>
                <li>Ready</li>
              </ol>
              {job.status === "reconciliation_required" &&
                job.providerJobId && (
                  <Button
                    disabled={studio.busy}
                    onClick={() =>
                      void studio.run(() => studio.resume({ jobId: job._id }))
                    }
                  >
                    Check status
                  </Button>
                )}
              <Button onClick={onLibrary}>Back to your creations</Button>
            </div>
          ) : job.status === "failed" ? (
            <div className="generation-panel">
              <h2>We couldn’t create this video.</h2>
              <p>Your prompt and settings are saved below.</p>
              <p>
                {job.financialState === "released"
                  ? "Your reserved credits were returned."
                  : "Check credit activity for the status of your reserved credits."}
              </p>
              <Button disabled={studio.busy} onClick={() => onEdit(job)}>
                Edit and try again
              </Button>
            </div>
          ) : (
            <div className="creation-player">
              {url && !previewError ? (
                <video
                  key={`${url}:${retry}`}
                  src={url}
                  aria-label="Generated video preview"
                  className="result-video"
                  controls
                  playsInline
                  preload="metadata"
                  onError={() => {
                    if (!playbackRetried.current) {
                      playbackRetried.current = true;
                      setRetry((value) => value + 1);
                    } else
                      setPreviewError(
                        "The video could not be played. Retry to request a fresh playback link, or download the saved video.",
                      );
                  }}
                />
              ) : previewError ? (
                <>
                  <Notice error>{previewError}</Notice>
                  <Button
                    onClick={() => {
                      playbackRetried.current = false;
                      setRetry((value) => value + 1);
                    }}
                  >
                    Retry preview
                  </Button>
                </>
              ) : (
                <p role="status">Loading your video…</p>
              )}
            </div>
          )}
        </div>
        <div className="creation-detail-info">
          <span
            className={`creation-badge ${job.status === "succeeded" ? "is-ready" : ""}`}
          >
            {generationStatus(job.status)}
          </span>
          <h2>Video details</h2>
          {job.status === "succeeded" && job.outputAssetId && (
            <>
              <Button
                variant="primary"
                disabled={studio.busy}
                onClick={() =>
                  void studio.run(async () => {
                    const url = await studio.preview({
                      assetId: job.outputAssetId!,
                      download: true,
                    });
                    const a = document.createElement("a");
                    a.href = url;
                    a.rel = "noopener";
                    a.click();
                  })
                }
              >
                <Download size={18} />
                Download video
              </Button>
              <div className="result-actions">
                <Button disabled={studio.busy} onClick={() => onRemix(job)}>
                  <Sparkles size={17} />
                  Remix
                </Button>
                <Button
                  onClick={() => setPublishing(!publishing)}
                  aria-expanded={publishing}
                >
                  {job.video?.status === "published"
                    ? "Publication settings"
                    : "Publish…"}
                </Button>
              </div>
            </>
          )}
          {publishing && (
            <div className="panel">
              <PublishForm job={job} studio={studio} />
            </div>
          )}
          <div className="panel creation-metadata">
            <strong>Prompt</strong>
            <p>{job.input.prompt}</p>
            <p>
              {job.input.duration}s · {job.input.aspectRatio} ·{" "}
              {job.input.resolution}
            </p>
            <p>
              {job.credits.toLocaleString()} credits{" "}
              {job.financialState === "released"
                ? "returned"
                : job.financialState === "settled"
                  ? "spent"
                  : "reserved"}
            </p>
            <details>
              <summary>Generation details</summary>
              <p>Created {new Date(job._creationTime).toLocaleString()}</p>
              <p>{job.input.mode === "remix" ? "Remix" : "Create"}</p>
              <p>{generationStatus(job.status)}</p>
            </details>
          </div>
          {studio.error && <Notice error>{studio.error}</Notice>}
          {studio.message && <Notice>{studio.message}</Notice>}
        </div>
      </div>
    </section>
  );
}

export function CreationLibraryPreview() {
  return (
    <section className="creations-page">
      <div className="creations-heading">
        <div>
          <span className="eyebrow">YOUR STUDIO</span>
          <h1>Your creations</h1>
          <p>Every idea, all in one place.</p>
        </div>
      </div>
      <div className="creation-grid">
        <NavLink className="creation-new" to="/create?view=new">
          <span>
            <Plus size={28} />
          </span>
          <strong>Create a video</strong>
          <small>Start a new idea or remix</small>
        </NavLink>
      </div>
      <div className="creation-empty">
        <Film size={32} />
        <h2>Your first idea starts here.</h2>
        <p>Your videos will appear here after you connect your account.</p>
        <p>Design preview · no generated videos</p>
      </div>
    </section>
  );
}

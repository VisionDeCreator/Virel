import { useEffect, useRef, useState } from "react";
import {
  api,
  useQuery,
  usePaginatedQuery,
  type useStudio,
  type Id,
} from "@virel/api-client";
import { Button, SegmentedControl, Notice } from "@virel/ui";
import type { PlatformBase } from "@virel/shared";
type Studio = ReturnType<typeof useStudio>;
export function StartingPoint({ studio }: { studio: Studio }) {
  const { input } = studio;
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const base = useQuery(
    api.media.base,
    input.mode === "remix"
      ? { assetId: input.sourceAssetId, videoId: input.sourceVideoId }
      : "skip",
  );
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  return (
    <section className="starting-point" aria-label="Starting point">
      <strong>Starting point</strong>
      {input.mode === "remix" ? (
        <>
          <div className="selected-base">
            {base && <BasePoster base={base} studio={studio} />}
            <div>
              <span className="creation-badge">Remixing</span>
              <h3>
                {base?.title ??
                  (base === null ? "Base unavailable" : "Loading base…")}
              </h3>
              {base && (
                <p>
                  @{base.creator} · {base.duration.toFixed(0)}s ·{" "}
                  {base.aspectRatio}
                </p>
              )}
            </div>
          </div>
          <p>This video is your base. Motion and timing follow the original.</p>
          {base === null && (
            <Notice error>
              Choose another platform video. This base is unavailable or no
              longer allows remixes.
            </Notice>
          )}
          <div className="result-actions">
            <Button disabled={studio.busy} onClick={() => setOpen(true)}>
              Change base
            </Button>
            <Button
              disabled={studio.busy}
              onClick={() => void studio.selectBase(null)}
            >
              Remove base
            </Button>
          </div>
        </>
      ) : (
        <>
          <h3>New video</h3>
          <p>
            Start from your idea, or choose an existing Virel video as your
            base.
          </p>
          <Button disabled={studio.busy} onClick={() => setOpen(true)}>
            Choose a platform video
          </Button>
        </>
      )}
      <dialog
        ref={dialog}
        className="base-picker"
        onCancel={() => setOpen(false)}
        aria-labelledby="base-picker-title"
      >
        <div className="creations-heading">
          <h2 id="base-picker-title">Choose a platform video</h2>
          <Button onClick={() => setOpen(false)}>Close</Button>
        </div>
        <p>
          Use one of your generated videos or a community video that allows
          remixes. Uploads cannot be remix bases.
        </p>
        {open && (
          <BasePicker
            studio={studio}
            onSelect={async (base) => {
              if (await studio.selectBase(base)) setOpen(false);
            }}
          />
        )}
      </dialog>
    </section>
  );
}
function BasePicker({
  studio,
  onSelect,
}: {
  studio: Studio;
  onSelect: (base: PlatformBase) => void;
}) {
  const [scope, setScope] = useState<"mine" | "community">("mine");
  const { results, status, loadMore } = usePaginatedQuery(
    api.media.bases,
    { scope },
    { initialNumItems: 12 },
  );
  return (
    <>
      <SegmentedControl
        label="Base video library"
        options={[
          { value: "mine", label: "My videos" },
          { value: "community", label: "Community" },
        ]}
        value={scope}
        onChange={setScope}
      />
      <div className="base-picker-grid">
        {results.map((base) => (
          <button
            key={base.assetId}
            disabled={studio.busy}
            className="base-option"
            onClick={() => onSelect(base)}
          >
            <BasePoster base={base} studio={studio} />
            <strong>{base.title}</strong>
            <small>
              @{base.creator} · {base.duration.toFixed(0)}s · {base.aspectRatio}
            </small>
          </button>
        ))}
      </div>
      {status === "LoadingFirstPage" ? (
        <p role="status">Loading platform videos…</p>
      ) : (
        !results.length && (
          <p>
            No eligible videos here yet. Create a video first, or check the
            community library.
          </p>
        )
      )}
      {status === "CanLoadMore" && (
        <Button onClick={() => loadMore(12)}>Load more videos</Button>
      )}
      {status === "LoadingMore" && <p role="status">Loading more videos…</p>}
      {studio.error && <Notice error>{studio.error}</Notice>}
    </>
  );
}
export function BasePoster({
  base,
  studio,
}: {
  base: PlatformBase;
  studio: Studio;
}) {
  const [url, setUrl] = useState(base.playbackUrl ?? "");
  useEffect(() => {
    let live = true;
    setUrl(base.playbackUrl ?? "");
    if (!base.playbackUrl)
      void studio
        .preview({ assetId: base.assetId as Id<"mediaAssets"> })
        .then((url) => {
          if (live) setUrl(url);
        })
        .catch(() => {});
    return () => {
      live = false;
    };
  }, [base.assetId, base.playbackUrl, studio.preview]);
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
    <div className="base-poster-placeholder" aria-hidden="true">
      ▷
    </div>
  );
}

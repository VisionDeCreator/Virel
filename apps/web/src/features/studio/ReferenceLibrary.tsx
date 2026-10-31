import { useEffect, useState } from "react";
import { type useStudio, type Id } from "@virel/api-client";
import {
  bindReference,
  scriptReferences,
  removeReference,
  renameReference,
  replaceReference,
  referenceLimit,
} from "@virel/shared";
import { Button } from "@virel/ui";
type Studio = ReturnType<typeof useStudio>;
function Thumbnail({
  assetId,
  type,
  studio,
}: {
  assetId: string;
  type: "image" | "video";
  studio: Studio;
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let live = true;
    void studio
      .preview({ assetId: assetId as Id<"mediaAssets"> })
      .then((url) => {
        if (live) setUrl(url);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [assetId, studio.preview]);
  return url ? (
    type === "image" ? (
      <img className="reference-thumbnail" src={url} alt="Reference preview" />
    ) : (
      <video
        className="reference-thumbnail"
        src={url}
        muted
        playsInline
        preload="metadata"
      />
    )
  ) : (
    <span>{type === "video" ? "Video" : "Image"}</span>
  );
}
export function ReferenceLibrary({ studio }: { studio: Studio }) {
  const refs = scriptReferences(studio.input);
  function attempt(operation: () => void) {
    try {
      operation();
    } catch (error) {
      studio.setError(
        error instanceof Error ? error.message : "Could not update reference.",
      );
    }
  }
  return (
    <section className="reference-library" aria-label="Reference library">
      <h3>Media & references</h3>
      <small>
        {studio.input.mode === "remix"
          ? "One required source video and up to 8 reference images."
          : "Optional: one reference video and up to 30 reference images. Images guide appearance; they are not automatically a starting frame."}
      </small>
      {refs.map((ref) => (
        <div
          className="reference-card"
          key={ref.assetId}
          draggable={!studio.busy}
          onDragStart={(event) =>
            event.dataTransfer.setData("application/x-virel-asset", ref.assetId)
          }
        >
          <Thumbnail assetId={ref.assetId} type={ref.type} studio={studio} />
          <div>
            <strong>
              {studio.assets?.find((asset) => asset._id === ref.assetId)
                ?.name ?? "Selected creator video"}
            </strong>
            <label>
              Reference name
              <input
                key={ref.alias}
                aria-label={`Reference name ${ref.alias}`}
                defaultValue={ref.alias}
                disabled={studio.busy}
                onBlur={(event) => {
                  if (event.target.value !== ref.alias)
                    attempt(() =>
                      studio.change(
                        renameReference(
                          studio.input,
                          ref.assetId,
                          event.target.value.trim(),
                        ),
                      ),
                    );
                }}
              />
            </label>
            <select
              aria-label={`Replace ${ref.alias}`}
              disabled={studio.busy}
              value=""
              onChange={(event) => {
                if (event.target.value)
                  attempt(() =>
                    studio.change(
                      replaceReference(
                        studio.input,
                        ref.assetId,
                        event.target.value,
                      ),
                    ),
                  );
              }}
            >
              <option value="">Replace reference…</option>
              {studio.assets
                ?.filter(
                  (asset) =>
                    asset.type === ref.type &&
                    !refs.some((ref) => ref.assetId === asset._id),
                )
                .map((asset) => (
                  <option key={asset._id} value={asset._id}>
                    {asset.name}
                  </option>
                ))}
            </select>
            <Button
              disabled={studio.busy}
              onClick={() =>
                studio.change(removeReference(studio.input, ref.assetId))
              }
            >
              Remove @{ref.alias}
            </Button>
          </div>
        </div>
      ))}
      <select
        aria-label="Add saved reference image"
        value=""
        disabled={
          studio.busy ||
          studio.input.referenceAssetIds.length >=
            referenceLimit(studio.input.mode)
        }
        onChange={(event) => {
          if (event.target.value)
            studio.change(
              bindReference(studio.input, event.target.value, "image"),
            );
        }}
      >
        <option value="">Add a saved image</option>
        {studio.assets
          ?.filter(
            (asset) =>
              asset.type === "image" &&
              !studio.input.referenceAssetIds.includes(asset._id),
          )
          .map((asset) => (
            <option key={asset._id} value={asset._id}>
              {asset.name}
            </option>
          ))}
      </select>
    </section>
  );
}

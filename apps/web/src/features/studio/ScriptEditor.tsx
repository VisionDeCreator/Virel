import { ReferenceThumbnail } from "./ReferenceLibrary";
import { useRef, useState, useLayoutEffect } from "react";
import { type useStudio, type Id, useQuery, api } from "@virel/api-client";
import {
  bindReference,
  scriptReferences,
  referenceLimit,
  replaceReference,
  replaceMention,
  removeReference,
} from "@virel/shared";
import { Button, Notice } from "@virel/ui";
type Studio = ReturnType<typeof useStudio>;
export function ScriptEditor({
  studio,
  onFiles,
}: {
  studio: Studio;
  onFiles: (files: File[]) => Promise<void>;
}) {
  const { input, scripts, busy } = studio;
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const mirror = useRef<HTMLDivElement>(null);
  const caretMarker = useRef<HTMLSpanElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 14, top: 40 });
  const [scrollTop, setScrollTop] = useState(0);
  const base = useQuery(
    api.media.base,
    input.mode === "remix"
      ? { assetId: input.sourceAssetId, videoId: input.sourceVideoId }
      : "skip",
  );
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [historyId, setHistoryId] = useState("");
  const refs = scriptReferences(input);
  const match = input.prompt.slice(0, caret).match(/(?:^|\s)@([\w]*)$/);
  const candidates: {
    _id: Id<"mediaAssets">;
    name: string;
    type: "image" | "video";
    playbackUrl?: string;
  }[] = (studio.assets ?? []).filter(
    (asset) => asset.type === "image" || asset._id === input.sourceAssetId,
  );
  if (
    input.sourceAssetId &&
    !candidates.some((asset) => asset._id === input.sourceAssetId)
  )
    candidates.push({
      _id: input.sourceAssetId as Id<"mediaAssets">,
      name: base?.title ?? "Base video",
      type: "video",
      playbackUrl: base?.playbackUrl,
    });
  const editingRef = refs.find((ref) => ref.alias === editing);
  const suggestions = candidates
    .filter(
      (asset) =>
        (!editingRef || asset.type === editingRef.type) &&
        (editing ||
          asset.name.toLowerCase().includes((match?.[1] ?? "").toLowerCase()) ||
          refs.some(
            (ref) =>
              ref.assetId === asset._id && ref.alias.includes(match?.[1] ?? ""),
          )),
    )
    .slice(0, 8);
  const showing = open && Boolean(match || editing);
  useLayoutEffect(() => {
    if (
      !showing ||
      !caretMarker.current ||
      !container.current ||
      !textarea.current
    )
      return;
    const marker = caretMarker.current.getBoundingClientRect();
    const box = container.current.getBoundingClientRect();
    const popupHeight = Math.min(
      280,
      suggestions.length * 76 + (editing ? 44 : 16),
    );
    const caretTop = marker.top - box.top - scrollTop;
    const preferredTop =
      window.innerHeight - (box.top + caretTop + 26) >= popupHeight
        ? caretTop + 26
        : caretTop - popupHeight;
    setPosition({
      left: Math.max(
        0,
        Math.min(marker.left - box.left, box.width - Math.min(300, box.width)),
      ),
      top: Math.max(
        8 - box.top,
        Math.min(preferredTop, window.innerHeight - popupHeight - 8 - box.top),
      ),
    });
  }, [showing, caret, input.prompt, scrollTop, suggestions.length, editing]);
  function insert(
    asset: Pick<NonNullable<Studio["assets"]>[number], "_id" | "name" | "type">,
    autocomplete = false,
  ) {
    try {
      if (editingRef) {
        if (asset._id !== editingRef.assetId) {
          const linked = refs.find((ref) => ref.assetId === asset._id);
          studio.change(
            linked
              ? {
                  ...removeReference(input, editingRef.assetId),
                  prompt: replaceMention(
                    input.prompt,
                    editingRef.alias,
                    linked.alias,
                  ),
                }
              : replaceReference(input, editingRef.assetId, asset._id),
          );
        }
        setOpen(false);
        setEditing(null);
        textarea.current?.focus();
        return;
      }
      if (asset.type === "video" && asset._id !== input.sourceAssetId)
        throw new Error("Choose a platform video using Starting point.");
      if (
        asset.type === "image" &&
        !input.referenceAssetIds.includes(asset._id) &&
        input.referenceAssetIds.length >= referenceLimit(input.mode)
      )
        throw new Error("Remove a reference image before adding another.");
      const next = { ...input, ...bindReference(input, asset._id, asset.type) };
      const ref = scriptReferences(next).find(
        (ref) => ref.assetId === asset._id,
      )!;
      const start =
        autocomplete && match
          ? caret - match[1].length - 1
          : (textarea.current?.selectionStart ?? input.prompt.length);
      const end = autocomplete
        ? caret
        : (textarea.current?.selectionEnd ?? start);
      const mention = `@${ref.alias} `;
      studio.change({
        ...next,
        prompt:
          input.prompt.slice(0, start) + mention + input.prompt.slice(end),
      });
      setOpen(false);
      requestAnimationFrame(() => {
        textarea.current?.focus();
        textarea.current?.setSelectionRange(
          start + mention.length,
          start + mention.length,
        );
      });
    } catch (error) {
      studio.setError(
        error instanceof Error ? error.message : "Could not link reference.",
      );
    }
  }
  const historical = scripts.versions?.find(
    (version) => version._id === historyId,
  );
  return (
    <section className="script-editor" aria-label="Script and references">
      <div className="script-save" role="status">
        {scripts.status}
      </div>
      {scripts.error && (
        <Notice error>
          {scripts.error}
          {scripts.recovery && (
            <Button disabled={busy} onClick={scripts.recoverLocal}>
              Recover local draft
            </Button>
          )}
          <Button
            disabled={busy}
            onClick={() => void studio.run(scripts.flush)}
          >
            Retry save
          </Button>
          <Button
            disabled={busy}
            onClick={() => void studio.run(scripts.reload)}
          >
            Reload saved script
          </Button>
        </Notice>
      )}
      <label htmlFor="studio-script">
        {input.mode === "remix" ? "What would you change?" : "Script"}
      </label>
      <div className="mention-input" ref={container}>
        <div className="mention-highlight-window">
          <div
            aria-hidden="true"
            className="mention-highlights"
            style={{ transform: `translateY(-${scrollTop}px)` }}
          >
            {input.prompt.split(/(@[a-zA-Z][\w]*)/g).map((part, index) =>
              part.startsWith("@") ? (
                <mark
                  key={index}
                  className={
                    refs.some((ref) => ref.alias === part.slice(1))
                      ? "mention-bound"
                      : "mention-missing"
                  }
                >
                  {part}
                </mark>
              ) : (
                <span key={index}>{part}</span>
              ),
            )}
            {"\n"}
          </div>
        </div>
        <div aria-hidden="true" className="mention-mirror" ref={mirror}>
          {input.prompt.slice(0, caret)}
          <span ref={caretMarker}>{"\u200b"}</span>
        </div>
        <textarea
          id="studio-script"
          ref={textarea}
          spellCheck={false}
          rows={7}
          maxLength={4000}
          disabled={busy}
          value={input.prompt}
          placeholder="Describe the scene, action, camera, and sound. Type @ to link an image or video reference."
          aria-expanded={showing}
          aria-controls="script-suggestions"
          aria-autocomplete="list"
          aria-activedescendant={
            showing && suggestions[active]
              ? `script-option-${active}`
              : undefined
          }
          onChange={(event) => {
            setEditing(null);
            studio.change({ prompt: event.target.value });
            setCaret(event.target.selectionStart);
            setOpen(true);
            setActive(0);
          }}
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
          onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
          onClick={(event) => {
            const caret = event.currentTarget.selectionStart;
            setCaret(caret);
            const token = [
              ...input.prompt.matchAll(/(^|[^\w@])@([a-zA-Z][\w]*)\b/g),
            ].find(
              (match) =>
                caret > match.index! + match[1].length &&
                caret <= match.index! + match[0].length,
            );
            setEditing(
              token && refs.some((ref) => ref.alias === token[2])
                ? token[2]
                : null,
            );
            setOpen(true);
            setActive(0);
          }}
          onBlur={() => setOpen(false)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
              return;
            }
            if (!showing || !suggestions.length) return;
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setActive(
                (index) =>
                  (index +
                    (event.key === "ArrowDown" ? 1 : -1) +
                    suggestions.length) %
                  suggestions.length,
              );
            } else if (event.key === "Enter") {
              event.preventDefault();
              insert(suggestions[active], true);
            } else if (event.key === "Escape") {
              setOpen(false);
            }
          }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            if (busy) return;
            const id = event.dataTransfer.getData("application/x-virel-asset");
            const asset = studio.assets?.find((asset) => asset._id === id);
            if (asset) insert(asset);
            else if (event.dataTransfer.files.length)
              void onFiles(Array.from(event.dataTransfer.files));
          }}
        />
        {showing && (
          <div
            id="script-suggestions"
            role="listbox"
            aria-label="Reference suggestions"
            style={{ left: position.left, top: position.top }}
          >
            {editing && (
              <p className="mention-picker-hint">
                Update all @{editing} references
              </p>
            )}
            {suggestions.map((asset, index) => (
              <button
                id={`script-option-${index}`}
                role="option"
                aria-selected={active === index}
                key={asset._id}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => insert(asset, true)}
              >
                <ReferenceThumbnail
                  assetId={asset._id}
                  type={asset.type}
                  studio={studio}
                  playbackUrl={
                    asset.playbackUrl ??
                    (asset.type === "video" ? base?.playbackUrl : undefined)
                  }
                />
                <span>
                  {asset.type === "video" ? "Video" : "Image"} · {asset.name}
                  <small>
                    {refs.find((ref) => ref.assetId === asset._id)?.alias
                      ? `@${refs.find((ref) => ref.assetId === asset._id)!.alias}`
                      : "Attach image"}
                  </small>
                </span>
              </button>
            ))}
            {!suggestions.length && <p>Upload a reference to link it here.</p>}
          </div>
        )}
      </div>
      <small>
        {input.prompt.length}/4,000 · Type @ or drag a library item into the
        script.
      </small>
      <div className="script-linked-references">
        {refs.map((ref) => (
          <Button
            key={ref.assetId}
            disabled={busy}
            onClick={() => {
              const asset = studio.assets?.find(
                (asset) => asset._id === ref.assetId,
              );
              if (asset) insert(asset);
              else if (ref.type === "video")
                insert({
                  _id: ref.assetId as Id<"mediaAssets">,
                  type: "video",
                  name: "Base video",
                });
            }}
          >
            Insert @{ref.alias}
          </Button>
        ))}
      </div>
      <details>
        <summary>Script history</summary>
        <select
          aria-label="Script history"
          value={historyId}
          onChange={(event) => setHistoryId(event.target.value)}
        >
          <option value="">Choose a saved version</option>
          {scripts.versions?.map((version) => (
            <option key={version._id} value={version._id}>
              Version {version.revision}
            </option>
          ))}
        </select>
        {historical && (
          <>
            <p>Preview only</p>
            <pre className="script-history-preview">
              {historical.input.prompt}
            </pre>
            <Button
              disabled={busy}
              onClick={() => {
                scripts.restore(historical);
                setHistoryId("");
              }}
            >
              Use this version as draft
            </Button>
          </>
        )}
      </details>
    </section>
  );
}

import { useRef, useState } from "react";
import { type useStudio } from "@virel/api-client";
import { bindReference, scriptReferences, referenceLimit } from "@virel/shared";
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
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [historyId, setHistoryId] = useState("");
  const refs = scriptReferences(input);
  const match = input.prompt.slice(0, caret).match(/(?:^|\s)@([\w]*)$/);
  const suggestions =
    studio.assets
      ?.filter(
        (asset) =>
          asset.name.toLowerCase().includes((match?.[1] ?? "").toLowerCase()) ||
          refs.some(
            (ref) =>
              ref.assetId === asset._id && ref.alias.includes(match?.[1] ?? ""),
          ),
      )
      .slice(0, 8) ?? [];
  function insert(
    asset: NonNullable<Studio["assets"]>[number],
    autocomplete = false,
  ) {
    try {
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
      <textarea
        id="studio-script"
        ref={textarea}
        rows={7}
        maxLength={4000}
        disabled={busy}
        value={input.prompt}
        placeholder="Describe the scene, action, camera, and sound. Type @ to link an image or video reference."
        aria-expanded={open && Boolean(match)}
        aria-controls="script-suggestions"
        aria-autocomplete="list"
        aria-activedescendant={
          open && match && suggestions[active]
            ? `script-option-${active}`
            : undefined
        }
        onChange={(event) => {
          studio.change({ prompt: event.target.value });
          setCaret(event.target.selectionStart);
          setOpen(true);
          setActive(0);
        }}
        onClick={(event) => {
          setCaret(event.currentTarget.selectionStart);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (!open || !match || !suggestions.length) return;
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
      {open && match && (
        <div
          id="script-suggestions"
          role="listbox"
          aria-label="Reference suggestions"
        >
          {suggestions.map((asset, index) => (
            <button
              id={`script-option-${index}`}
              role="option"
              aria-selected={active === index}
              key={asset._id}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => insert(asset, true)}
            >
              {asset.type === "video" ? "Video" : "Image"} · {asset.name}
            </button>
          ))}
          {!suggestions.length && <p>Upload a reference to link it here.</p>}
        </div>
      )}
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

import { useRef, useState } from "react";
import {
  api,
  usePaginatedQuery,
  useTimeline,
  type Id,
} from "@virel/api-client";
import {
  fitTimelineLayers,
  splitTimelineClip,
  timelineDuration,
  timelineLayout,
  type Timeline,
  type TimelineAudio,
  type TimelineText,
} from "@virel/shared";
import { Button, Notice } from "@virel/ui";
import { TimelinePreview } from "./TimelinePreview";
const uid = () => crypto.randomUUID();
function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max = 120,
  step = 0.1,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className="timeline-field">
      {label}
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={Number(value.toFixed(3))}
        onChange={(e) => {
          if (Number.isFinite(e.target.valueAsNumber))
            onChange(e.target.valueAsNumber);
        }}
      />
    </label>
  );
}
export function TimelineEditor({
  projectId,
  onBack,
}: {
  projectId: Id<"timelineProjects">;
  onBack: () => void;
}) {
  const editor = useTimeline(projectId);
  const { document, assets, project } = editor;
  const [selected, setSelected] = useState<string | null>(null),
    [time, setTime] = useState(0),
    [playing, setPlaying] = useState(false),
    [zoom, setZoom] = useState(55),
    [snap, setSnap] = useState(true);
  const [description, setDescription] = useState(""),
    [remixEnabled, setRemixEnabled] = useState(true),
    [message, setMessage] = useState("");
  const file = useRef<HTMLInputElement>(null),
    drag = useRef<string | null>(null);
  const duration = timelineDuration(document),
    layout = timelineLayout(document),
    clip = document.clips.find((c) => c.id === selected);
  function change(next: Timeline) {
    setPlaying(false);
    editor.change(next);
    setTime(Math.min(time, timelineDuration(next)));
  }
  function move(id: string, delta: number) {
    const clips = [...document.clips],
      index = clips.findIndex((c) => c.id === id),
      target = index + delta;
    if (target < 0 || target >= clips.length) return;
    [clips[index], clips[target]] = [clips[target], clips[index]];
    change({ ...document, clips });
  }
  function seek(value: number) {
    const boundaries = layout.flatMap((row) => [row.start, row.end]);
    const near = boundaries.find((b) => Math.abs(b - value) < 0.12);
    setTime(
      Math.max(
        0,
        Math.min(duration, snap && near !== undefined ? near : value),
      ),
    );
  }
  async function upload(files: FileList | null) {
    for (const item of Array.from(files ?? [])) {
      const type = item.type || (/\.m4a$/i.test(item.name) ? "audio/mp4" : "");
      await editor.upload(
        { name: item.name, type, bytes: item.size },
        async (url) => {
          const response = await fetch(url, {
            method: "PUT",
            headers: { "Content-Type": type },
            body: item,
          });
          if (!response.ok) throw new Error("Upload failed. Please try again.");
        },
      );
    }
  }
  if (!editor.ready) return <p role="status">Opening timeline…</p>;
  const currentExport = project?.latestExport,
    exportFresh =
      currentExport?.revision === project?.revision && !editor.dirty;
  return (
    <section className="timeline-editor">
      <div className="timeline-toolbar">
        <Button
          variant="ghost"
          onClick={() => {
            setPlaying(false);
            void editor.run(async () => {
              await editor.flush();
              onBack();
            });
          }}
        >
          ← Your creations
        </Button>
        <input
          aria-label="Project title"
          value={editor.title}
          maxLength={100}
          onChange={(e) => editor.setTitle(e.target.value)}
        />
        <span role="status">
          {editor.saving ? "Saving…" : editor.dirty ? "Unsaved edits" : "Saved"}
        </span>
        <Button disabled={!editor.canUndo} onClick={editor.undo}>
          Undo
        </Button>
        <Button disabled={!editor.canRedo} onClick={editor.redo}>
          Redo
        </Button>
        <Button
          disabled={editor.busy || !document.clips.length}
          onClick={() => {
            setPlaying(false);
            void editor.export();
          }}
        >
          Export video
        </Button>
      </div>
      <p className="timeline-note">
        Manual editor · No AI generation or credit charge · One creator lineage
        · Up to 120 seconds
      </p>
      {editor.recovery && (
        <Notice>
          Unsaved edits were recovered from this device.
          <Button onClick={editor.restore}>Restore local edits</Button>
        </Notice>
      )}
      {editor.error && (
        <Notice error>
          {editor.error}
          <Button onClick={() => void editor.run(editor.flush)}>
            Retry save
          </Button>
          <Button onClick={editor.reload}>Reload saved version</Button>
        </Notice>
      )}
      <div className="timeline-workspace">
        <aside className="timeline-media">
          <h2>Your media</h2>
          <Button disabled={editor.busy} onClick={() => file.current?.click()}>
            Import music
          </Button>
          <input
            ref={file}
            hidden
            type="file"
            accept="audio/*"
            multiple
            onChange={(e) => {
              void upload(e.target.files);
              e.target.value = "";
            }}
          />
          <p>
            This timeline uses only your generated video. Split or duplicate it
            to create more clips.
          </p>
          {assets
            ?.filter((a) => a.type === "audio")
            .map((a) => (
              <div key={a._id} className="timeline-asset">
                <span>
                  {a.type === "audio" ? "♫" : "▣"} {a.name}
                </span>
                <small>{a.duration?.toFixed(1)}s</small>
                <Button
                  disabled={!a.duration || editor.busy}
                  onClick={() => {
                    if (!a.duration) return;
                    const id = uid();
                    if (a.type === "audio") {
                      const length = Math.min(a.duration, duration);
                      if (length < 0.1) return;
                      change({
                        ...document,
                        audio: [
                          ...document.audio,
                          {
                            id,
                            assetId: a._id,
                            start: 0,
                            end: length,
                            at: 0,
                            volume: 0.5,
                            fadeIn: 0,
                            fadeOut: 0,
                          },
                        ],
                      });
                    }
                  }}
                >
                  Add music
                </Button>
              </div>
            ))}
        </aside>
        <div className="timeline-monitor">
          <TimelinePreview
            document={document}
            urls={editor.urls}
            time={time}
            playing={playing}
            seek={setTime}
            stop={() => setPlaying(false)}
          />
          <div className="timeline-playback">
            <Button
              disabled={!duration}
              onClick={() => {
                if (time >= duration) setTime(0);
                setPlaying(!playing);
              }}
            >
              {playing ? "Pause" : "Play"}
            </Button>
            <span>
              {time.toFixed(1)} / {duration.toFixed(1)}s
            </span>
            <label>
              Canvas
              <select
                value={document.aspectRatio}
                onChange={(e) =>
                  change({
                    ...document,
                    aspectRatio: e.target.value as Timeline["aspectRatio"],
                  })
                }
              >
                <option>9:16</option>
                <option>16:9</option>
                <option>1:1</option>
              </select>
            </label>
          </div>
          <input
            aria-label="Playhead"
            type="range"
            min={0}
            max={duration || 1}
            step={0.01}
            value={Math.min(time, duration)}
            onChange={(e) => {
              setPlaying(false);
              seek(Number(e.target.value));
            }}
          />
        </div>
        <aside className="timeline-inspector">
          <h2>{clip ? "Clip controls" : "Select a clip"}</h2>
          {clip && (
            <>
              <NumberField
                label="Trim start (s)"
                value={clip.start}
                onChange={(start) => editor.updateClip(clip.id, { start })}
              />
              <NumberField
                label="Trim end (s)"
                value={clip.end}
                onChange={(end) => editor.updateClip(clip.id, { end })}
              />
              <NumberField
                label="Clip volume"
                value={clip.volume}
                max={1}
                onChange={(volume) => editor.updateClip(clip.id, { volume })}
              />
              <Button
                onClick={() =>
                  editor.updateClip(clip.id, {
                    volume: clip.volume === 0 ? 1 : 0,
                  })
                }
              >
                {clip.volume === 0 ? "Unmute clip" : "Mute original audio"}
              </Button>
              <NumberField
                label="Crop zoom"
                value={clip.zoom}
                min={1}
                max={3}
                onChange={(zoom) => editor.updateClip(clip.id, { zoom })}
              />
              <NumberField
                label="Crop horizontal"
                value={clip.x}
                max={1}
                step={0.05}
                onChange={(x) => editor.updateClip(clip.id, { x })}
              />
              <NumberField
                label="Crop vertical"
                value={clip.y}
                max={1}
                step={0.05}
                onChange={(y) => editor.updateClip(clip.id, { y })}
              />
              <label>
                Transition to next clip
                <select
                  value={clip.transition}
                  onChange={(e) =>
                    editor.updateClip(clip.id, {
                      transition: e.target.value as typeof clip.transition,
                      transitionDuration: e.target.value === "cut" ? 0 : 0.3,
                    })
                  }
                >
                  <option value="cut">Cut</option>
                  <option value="fade">Fade through black</option>
                  <option value="crossfade">Crossfade</option>
                </select>
              </label>
              {clip.transition !== "cut" && (
                <NumberField
                  label="Transition duration (s)"
                  value={clip.transitionDuration}
                  min={0.1}
                  max={2}
                  onChange={(transitionDuration) =>
                    editor.updateClip(clip.id, { transitionDuration })
                  }
                />
              )}
              <Button
                onClick={() =>
                  void editor.run(async () => {
                    const row = layout.find((row) => row.clip.id === clip.id)!;
                    change(
                      splitTimelineClip(
                        document,
                        clip.id,
                        clip.start + time - row.start,
                        uid(),
                      ),
                    );
                  })
                }
              >
                Split at playhead
              </Button>
              <Button
                onClick={() =>
                  change({
                    ...document,
                    clips: document.clips.flatMap((c) =>
                      c.id === clip.id ? [c, { ...c, id: uid() }] : [c],
                    ),
                  })
                }
              >
                Duplicate clip
              </Button>
              <Button onClick={() => move(clip.id, -1)}>Move earlier</Button>
              <Button onClick={() => move(clip.id, 1)}>Move later</Button>
              <Button
                onClick={() => {
                  change(
                    fitTimelineLayers({
                      ...document,
                      clips: document.clips.filter((c) => c.id !== clip.id),
                    }),
                  );
                  setSelected(null);
                }}
              >
                Delete clip
              </Button>
            </>
          )}
        </aside>
      </div>
      <div className="timeline-track-heading">
        <h2>Timeline</h2>
        <label>
          Zoom
          <input
            aria-label="Timeline zoom"
            type="range"
            min={20}
            max={150}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={snap}
            onChange={(e) => setSnap(e.target.checked)}
          />
          Snapping
        </label>
        <Button
          disabled={!duration}
          onClick={() =>
            change({
              ...document,
              texts: [
                ...document.texts,
                {
                  id: uid(),
                  text: "Your text",
                  start: Math.min(time, duration - 0.1),
                  end: duration,
                  x: 0.5,
                  y: 0.8,
                  size: 48,
                  color: "#ffffff",
                  font: "sans",
                },
              ],
            })
          }
        >
          Add text
        </Button>
      </div>
      <div className="timeline-scroll">
        <div
          className="timeline-tracks"
          style={{ width: Math.max(600, duration * zoom) }}
        >
          <div className="timeline-ruler">
            {Array.from({ length: Math.ceil(duration) + 1 }, (_, i) => (
              <button
                key={i}
                style={{ left: i * zoom }}
                onClick={() => {
                  setPlaying(false);
                  seek(i);
                }}
              >
                {i}s
              </button>
            ))}
          </div>
          <div className="timeline-lane" aria-label="Video track">
            {layout.map((row, index) => (
              <button
                draggable
                onDragStart={() => {
                  drag.current = row.clip.id;
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  const from = document.clips.findIndex(
                    (c) => c.id === drag.current,
                  );
                  if (from < 0) return;
                  const clips = [...document.clips];
                  const [moved] = clips.splice(from, 1);
                  clips.splice(index, 0, moved);
                  change({ ...document, clips });
                }}
                aria-pressed={selected === row.clip.id}
                className="timeline-block"
                key={row.clip.id}
                style={{
                  left: row.start * zoom,
                  width: Math.max(16, (row.end - row.start) * zoom),
                }}
                onClick={() => {
                  setSelected(row.clip.id);
                  setPlaying(false);
                  seek(row.start);
                }}
              >
                {editor.urls[row.clip.assetId] && (
                  <video
                    src={`${editor.urls[row.clip.assetId]}#t=${row.clip.start}`}
                    muted
                    preload="metadata"
                  />
                )}
                <span>
                  {index + 1} ·{" "}
                  {assets?.find((a) => a._id === row.clip.assetId)?.name ??
                    "Clip"}
                </span>
              </button>
            ))}
          </div>
          <div className="timeline-lane">
            {document.texts.map((text) => (
              <div
                className="timeline-block text"
                key={text.id}
                style={{
                  left: text.start * zoom,
                  width: (text.end - text.start) * zoom,
                }}
              >
                {text.text}
              </div>
            ))}
          </div>
          <div className="timeline-lane">
            {document.audio.map((a) => (
              <div
                className="timeline-block music"
                key={a.id}
                style={{ left: a.at * zoom, width: (a.end - a.start) * zoom }}
              >
                ♫ {assets?.find((asset) => asset._id === a.assetId)?.name}
              </div>
            ))}
          </div>
          <div className="timeline-playhead" style={{ left: time * zoom }} />
        </div>
      </div>
      <div className="timeline-layers">
        <div>
          <h2>Text layers</h2>
          {document.texts.map((text) => (
            <TextControls
              key={text.id}
              text={text}
              duration={duration}
              update={(patch) =>
                change({
                  ...document,
                  texts: document.texts.map((t) =>
                    t.id === text.id ? { ...t, ...patch } : t,
                  ),
                })
              }
              remove={() =>
                change({
                  ...document,
                  texts: document.texts.filter((t) => t.id !== text.id),
                })
              }
            />
          ))}
        </div>
        <div>
          <h2>Music tracks</h2>
          {document.audio.map((a) => (
            <AudioControls
              key={a.id}
              audio={a}
              update={(patch) =>
                change({
                  ...document,
                  audio: document.audio.map((t) =>
                    t.id === a.id ? { ...t, ...patch } : t,
                  ),
                })
              }
              remove={() =>
                change({
                  ...document,
                  audio: document.audio.filter((t) => t.id !== a.id),
                })
              }
            />
          ))}
        </div>
      </div>
      {currentExport && (
        <div className="panel timeline-export">
          <h2>Export</h2>
          <p role="status">
            {currentExport.status === "ready"
              ? exportFresh
                ? "Your edited video is ready."
                : "This export is from an earlier revision. Export again to include your changes."
              : currentExport.status === "failed"
                ? currentExport.error
                : `${currentExport.status === "queued" ? "Waiting to export" : "Rendering your edit"} · ${Math.round(currentExport.progress * 100)}%`}
          </p>
          {["queued", "rendering"].includes(currentExport.status) && (
            <progress max={1} value={currentExport.progress} />
          )}{" "}
          {currentExport.status === "failed" && (
            <Button onClick={() => void editor.export()}>Retry export</Button>
          )}
          {currentExport.status === "ready" && (
            <>
              <video
                className="result-video"
                src={editor.urls[currentExport.assetId!]}
                controls
                playsInline
              />
              <Button
                onClick={() =>
                  void editor.download().then((url) => {
                    if (url) {
                      const link = window.document.createElement("a");
                      link.href = url;
                      link.rel = "noopener";
                      link.click();
                    }
                  })
                }
              >
                Download edited video
              </Button>
              <label>
                Description
                <textarea
                  value={description}
                  maxLength={2000}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={remixEnabled && duration <= 15}
                  disabled={duration > 15}
                  onChange={(e) => setRemixEnabled(e.target.checked)}
                />
                Allow remixes{" "}
                {duration > 15 &&
                  "(AI remixes support videos up to 15 seconds)"}
              </label>
              <Button
                disabled={!exportFresh || editor.busy}
                onClick={() =>
                  void editor
                    .publish(description, remixEnabled && duration <= 15)
                    .then((id) => {
                      if (id) setMessage("Published your edited video.");
                    })
                }
              >
                Publish edited video
              </Button>
            </>
          )}
          {message && <p role="status">{message}</p>}
        </div>
      )}
    </section>
  );
}
function TextControls({
  text,
  duration,
  update,
  remove,
}: {
  text: TimelineText;
  duration: number;
  update: (patch: Partial<TimelineText>) => void;
  remove: () => void;
}) {
  return (
    <fieldset className="timeline-layer">
      <legend>Text</legend>
      <label>
        Text content
        <input
          value={text.text}
          maxLength={300}
          onChange={(e) => update({ text: e.target.value })}
        />
      </label>
      <NumberField
        label="Text start (s)"
        value={text.start}
        max={duration}
        onChange={(start) => update({ start })}
      />
      <NumberField
        label="Text end (s)"
        value={text.end}
        max={duration}
        onChange={(end) => update({ end })}
      />
      <NumberField
        label="Text horizontal"
        value={text.x}
        max={1}
        step={0.05}
        onChange={(x) => update({ x })}
      />
      <NumberField
        label="Text vertical"
        value={text.y}
        max={1}
        step={0.05}
        onChange={(y) => update({ y })}
      />
      <NumberField
        label="Font size"
        value={text.size}
        min={12}
        max={120}
        step={1}
        onChange={(size) => update({ size })}
      />
      <label>
        Text color
        <input
          type="color"
          value={text.color}
          onChange={(e) => update({ color: e.target.value })}
        />
      </label>
      <label>
        Font
        <select
          value={text.font}
          onChange={(e) =>
            update({ font: e.target.value as TimelineText["font"] })
          }
        >
          <option value="sans">Sans</option>
          <option value="serif">Serif</option>
          <option value="mono">Monospace</option>
        </select>
      </label>
      <Button onClick={remove}>Remove text</Button>
    </fieldset>
  );
}
function AudioControls({
  audio: a,
  update,
  remove,
}: {
  audio: TimelineAudio;
  update: (patch: Partial<TimelineAudio>) => void;
  remove: () => void;
}) {
  return (
    <fieldset className="timeline-layer">
      <legend>Music</legend>
      {(
        [
          ["Music trim start (s)", "start", 600],
          ["Music trim end (s)", "end", 600],
          ["Music timeline start (s)", "at", 120],
          ["Music volume", "volume", 1],
          ["Fade in (s)", "fadeIn", 60],
          ["Fade out (s)", "fadeOut", 60],
        ] as const
      ).map(([label, key, max]) => (
        <NumberField
          key={key}
          label={label}
          value={a[key]}
          max={max}
          onChange={(value) => update({ [key]: value })}
        />
      ))}
      <Button onClick={remove}>Remove music</Button>
    </fieldset>
  );
}
export function TimelineProjects({ open }: { open: (id: string) => void }) {
  const {
    results: projects,
    status,
    loadMore,
  } = usePaginatedQuery(api.timeline.list, {}, { initialNumItems: 12 });
  return (
    <section className="timeline-projects">
      <h2>Manual edits</h2>
      <p>Open a generated video in Your creations to edit its timeline.</p>
      <div className="creation-grid">
        {projects?.map((p) => (
          <button
            className="creation-card timeline-project-card"
            key={p._id}
            onClick={() => open(p._id)}
          >
            <strong>{p.title}</strong>
            <small>
              {p.document.clips.length} clips ·{" "}
              {timelineDuration(p.document).toFixed(1)}s
            </small>
            <small>Open timeline →</small>
          </button>
        ))}
      </div>
      {status === "CanLoadMore" && (
        <Button onClick={() => loadMore(12)}>More editing projects</Button>
      )}
    </section>
  );
}

import { useState } from "react";
import { Panel, Button, SegmentedControl, Notice, TextArea } from "@virel/ui";
import {
  creationModes,
  generationDurations,
  defaultStudioInput,
  aspectRatios,
  type StudioInput,
  type CreationMode,
} from "@virel/shared";
import { MediaDropzone } from "./MediaDropzone";
export function StudioPreview({ connected }: { connected: boolean }) {
  const [mode, setMode] = useState<CreationMode>("create");
  const [drafts, setDrafts] = useState<Record<CreationMode, StudioInput>>({
    create: defaultStudioInput,
    remix: { ...defaultStudioInput, mode: "remix" },
  });
  const input = drafts[mode];
  const [media, setMedia] = useState<Record<CreationMode, string[]>>({
    create: [],
    remix: [],
  });
  function change(patch: Partial<StudioInput>) {
    setDrafts((old) => ({ ...old, [mode]: { ...old[mode], ...patch } }));
  }
  return (
    <div className="studio-page">
      <div className="studio-heading">
        <span className="eyebrow">YOUR STUDIO</span>
        <h1>
          Make something <em>worth remixing.</em>
        </h1>
        <p>Create something new, or reimagine a source video.</p>
      </div>
      <div className="studio-grid">
        <Panel className="studio-controls">
          <SegmentedControl
            label="Creation mode"
            options={creationModes}
            value={mode}
            onChange={setMode}
          />
          <Notice>
            Generated videos: <strong>4–15 seconds · 15-second maximum.</strong>{" "}
            New Create videos fit the Remix duration limit.
          </Notice>
          <MediaDropzone
            kind="media"
            label={
              mode === "create"
                ? "Optional images or reference video"
                : "Source video and reference images"
            }
            description={
              mode === "create"
                ? "Media is optional. Reference video: 4–15 seconds, 15-second maximum. Drag files here or browse."
                : "A source video (4–15 seconds, 15-second maximum) is required for Remix, with reference images."
            }
            onFiles={(files) =>
              setMedia((old) => ({
                ...old,
                [mode]: files.map((file) => file.name),
              }))
            }
          />
          {media[mode].map((name) => (
            <p key={name}>{name} · selected locally</p>
          ))}
          <TextArea
            label={mode === "create" ? "Script" : "What would you change?"}
            rows={6}
            maxLength={4000}
            value={input.prompt}
            onChange={(event) => change({ prompt: event.target.value })}
          />
          <p>Model: {mode === "create" ? "Seedance 2.5" : "Remix Lite"}</p>
          {mode === "create" && (
            <div className="settings-row">
              <label>
                Duration
                <select
                  aria-label="Duration"
                  aria-describedby="preview-duration-limit"
                  value={input.duration}
                  onChange={(event) =>
                    change({ duration: Number(event.target.value) })
                  }
                >
                  {generationDurations.map((duration) => (
                    <option key={duration} value={duration}>
                      {duration} seconds
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Aspect ratio
                <select
                  aria-label="Aspect ratio"
                  value={input.aspectRatio}
                  onChange={(event) =>
                    change({
                      aspectRatio: event.target
                        .value as StudioInput["aspectRatio"],
                    })
                  }
                >
                  {aspectRatios.map((ratio) => (
                    <option key={ratio.value}>{ratio.value}</option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {mode === "create" && (
            <small id="preview-duration-limit">
              Maximum 15 seconds, so your creation can be used in Remix.
            </small>
          )}
          <label>
            Resolution
            <select
              aria-label="Resolution"
              value={input.resolution}
              onChange={(event) =>
                change({
                  resolution: event.target.value as StudioInput["resolution"],
                })
              }
            >
              <option>720p</option>
              <option>1080p</option>
            </select>
          </label>
          <Button variant="primary" disabled>
            Create video
          </Button>
          <Notice>
            {connected ? "Sign in" : "Connect the backend and sign in"} to
            upload, save scripts, and generate videos. These local selections
            have not been uploaded.
          </Notice>
        </Panel>
        <figure className="studio-preview">
          <img
            src="/images/desert-dancer.png"
            alt="Visual inspiration: a dancer in warm desert light"
          />
          <figcaption>Concept artwork · not a generated result</figcaption>
        </figure>
      </div>
    </div>
  );
}

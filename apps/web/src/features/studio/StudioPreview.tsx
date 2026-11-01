import { useState } from "react";
import { Panel, Button, SegmentedControl, Notice, TextArea } from "@virel/ui";
import {
  generationDurations,
  defaultStudioInput,
  aspectRatios,
  type StudioInput,
  type CreationMode,
} from "@virel/shared";
import { MediaDropzone } from "./MediaDropzone";
export function StudioPreview({ connected }: { connected: boolean }) {
  const [mode] = useState<CreationMode>("create");
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
        <h1>Create a video</h1>
        <p>Start with an idea. Make it yours.</p>
      </div>
      <div className="studio-grid">
        <Panel className="studio-controls">
          <section className="starting-point">
            <strong>Starting point</strong>
            <h3>New video</h3>
            <p>Choose an existing Virel video to use as a remix base.</p>
            <Button disabled>Choose a platform video</Button>
          </section>
          <TextArea
            label={mode === "create" ? "Script" : "What would you change?"}
            rows={6}
            maxLength={4000}
            value={input.prompt}
            onChange={(event) => change({ prompt: event.target.value })}
          />
          <details className="reference-section">
            <summary>References · optional for Create</summary>
            <MediaDropzone
              kind="image"
              label="Optional image references"
              description="Up to 30 images · JPG, PNG, or WebP · 10 MB each"
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
          </details>
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
          <p className="generation-expectation">
            Generation can take several minutes, sometimes longer than 5
            minutes. Your video starts private.
          </p>
          <Button variant="primary" disabled>
            Create video
          </Button>
          <Notice>
            {connected ? "Sign in" : "Connect the backend and sign in"} to
            upload, save scripts, and generate videos. These local selections
            have not been uploaded.
          </Notice>
        </Panel>
        <aside className="creation-guidance panel">
          <span className="eyebrow">FROM IDEA TO VIDEO</span>
          <h2>A little detail goes a long way.</h2>
          <p>
            Describe the subject, action, setting, camera movement, and sound.
          </p>
          <p>Add references when they help explain your idea.</p>
          <hr />
          <strong>Your video starts private.</strong>
          <p>You choose whether to publish it after it is ready.</p>
        </aside>
      </div>
    </div>
  );
}

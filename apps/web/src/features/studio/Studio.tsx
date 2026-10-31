import { useState, type ChangeEvent } from "react";
import { Sparkles, Upload, ArrowUpRight } from "lucide-react";
import { Panel, Button, SegmentedControl, TextArea, Notice } from "@virel/ui";
import {
  creationModes,
  aspectRatios,
  durations,
  type CreationMode,
} from "@virel/shared";
export function Studio({ connected }: { connected: boolean }) {
  const [mode, setMode] = useState<CreationMode>("text");
  const [prompt, setPrompt] = useState("");
  const [ratio, setRatio] = useState("9:16");
  const [duration, setDuration] = useState("5");
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  function selectImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setError("");
    setFileName("");
    if (!file) return;
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 10 * 1024 * 1024
    ) {
      setError("Choose a JPG, PNG, or WebP image under 10 MB.");
      event.target.value = "";
      return;
    }
    setFileName(file.name);
  }
  return (
    <div className="studio-page">
      <div className="studio-heading">
        <span className="eyebrow">YOUR NEXT CREATION</span>
        <h1>
          Make something
          <br />
          <em>worth remixing.</em>
        </h1>
        <p>A spark of an idea. A whole new world.</p>
      </div>
      <div className="studio-grid">
        <Panel className="studio-controls">
          <SegmentedControl
            label="Creation mode"
            options={creationModes}
            value={mode}
            onChange={setMode}
          />
          {mode === "image" && (
            <div className="upload-zone">
              <Upload size={24} />
              <label htmlFor="source-image">
                {fileName || "Choose your starting image"}
              </label>
              <input
                id="source-image"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={selectImage}
              />
              <small>JPG, PNG, WebP · up to 10 MB · stays on this device</small>
            </div>
          )}
          {mode === "remix" && (
            <Notice>
              Choose a remix-enabled video from the feed when generation
              launches. Your source creator will stay credited.
            </Notice>
          )}
          <TextArea
            label={mode === "remix" ? "What would you change?" : "Your prompt"}
            placeholder="A dancer moving through sunlit dunes, flowing silk, cinematic slow motion…"
            rows={6}
            maxLength={2000}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <span className="counter">{prompt.length}/2,000</span>
          <div className="settings-row">
            <div className="field">
              <label htmlFor="duration">Duration</label>
              <select
                id="duration"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              >
                {durations.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="ratio">Aspect ratio</label>
              <select
                id="ratio"
                value={ratio}
                onChange={(e) => setRatio(e.target.value)}
              >
                {aspectRatios.map((option) => (
                  <option key={option.value}>{option.value}</option>
                ))}
              </select>
            </div>
          </div>
          <Button variant="primary" className="create-action" disabled>
            <Sparkles size={18} />
            Create video
            <ArrowUpRight size={18} />
          </Button>
          <Notice>
            Generation is coming soon. Settings are a preview; no credits will
            be charged.{!connected && " Sign-in is not connected yet."}
          </Notice>
          {error && <Notice error>{error}</Notice>}
        </Panel>
        <figure className="studio-preview">
          <img
            src="/images/desert-dancer.png"
            alt="Visual inspiration: a dancer with flowing ivory fabric in warm desert light"
          />
          <figcaption>
            <span className="preview-tag">VISUAL INSPIRATION</span>
            <span>Let the light lead.</span>
            <small>Concept artwork · not a generated result</small>
          </figcaption>
        </figure>
      </div>
      <div className="studio-footer">
        <span>Start with a feeling. Make it your own.</span>
        <span>CREATE / REMIX / REPEAT</span>
      </div>
    </div>
  );
}

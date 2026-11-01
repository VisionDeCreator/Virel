import { afterAll, beforeAll, expect, test } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { newTimelineClip, type Timeline } from "@virel/shared";
import { renderTimeline, runMediaTool } from "../src/services/timelineRender";
let directory: string;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "virel-render-test-"));
  await runMediaTool("ffmpeg", [
    "-y",
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=red:s=160x240:r=30:d=1",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    join(directory, "red.mp4"),
  ]);
  await runMediaTool("ffmpeg", [
    "-y",
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=blue:s=240x160:r=30:d=1",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=1",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    join(directory, "blue.mp4"),
  ]);
  await runMediaTool("ffmpeg", [
    "-y",
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=880:duration=3",
    join(directory, "music.wav"),
  ]);
});
afterAll(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});
for (const transition of ["cut", "fade", "crossfade"] as const)
  test(`real FFmpeg exports ${transition} with trim, crop, text, original audio and music`, async () => {
    const overlap = transition === "cut" ? 0 : 0.2;
    const duration = 1.8 - overlap;
    const timeline: Timeline = {
      aspectRatio: "1:1",
      clips: [
        {
          ...newTimelineClip("red", 1, "red-clip"),
          start: 0.1,
          end: 1,
          transition,
          transitionDuration: overlap,
          zoom: 1.2,
          x: 0.3,
        },
        { ...newTimelineClip("blue", 1, "blue-clip"), end: 0.9, volume: 0.4 },
      ],
      texts: [
        {
          id: "caption",
          text: "A creator’s edit: 100% [safe]",
          start: 0.1,
          end: duration - 0.1,
          x: 0.5,
          y: 0.8,
          size: 36,
          color: "#ffffff",
          font: "sans",
        },
      ],
      audio: [
        {
          id: "song",
          assetId: "music",
          start: 0.2,
          end: 0.2 + duration,
          at: 0,
          volume: 0.2,
          fadeIn: 0,
          fadeOut: 0.1,
        },
      ],
    };
    const outputDir = await mkdtemp(join(directory, `export-${transition}-`));
    const source = new Map([
      ["red", join(directory, "red.mp4")],
      ["blue", join(directory, "blue.mp4")],
      ["music", join(directory, "music.wav")],
    ]);
    const progress: number[] = [];
    const output = await renderTimeline(timeline, source, outputDir, (value) =>
      progress.push(value),
    );
    const probe = JSON.parse(
      await runMediaTool("ffprobe", [
        "-v",
        "error",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
        output,
      ]),
    );
    expect(
      probe.streams.find(
        (s: { codec_type: string }) => s.codec_type === "video",
      ),
    ).toMatchObject({ codec_name: "h264", width: 720, height: 720 });
    expect(
      probe.streams.find(
        (s: { codec_type: string }) => s.codec_type === "audio",
      ),
    ).toMatchObject({ codec_name: "aac", channels: 2 });
    expect(Math.abs(Number(probe.format.duration) - duration)).toBeLessThan(
      0.15,
    );
    expect(progress.at(-1)).toBeGreaterThan(0.8);
  }, 30000);

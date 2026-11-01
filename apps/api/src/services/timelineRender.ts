import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform, Readable } from "node:stream";
import { createWriteStream, createReadStream } from "node:fs";
import { v } from "convex/values";
import { internalAction } from "../runtime/operation";
import { internal } from "../../../../packages/backend/convex/_generated/api";
import { storage, GetObjectCommand, Upload } from "./r2";
import {
  timelineDuration,
  timelineLayout,
  transitionDuration,
  validateTimeline,
  type Timeline,
} from "@virel/shared";

export async function runMediaTool(
  binary: string,
  args: string[],
  progress?: (seconds: number) => void,
) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "",
      stderr = "",
      pending = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Media rendering timed out."));
    }, 240000);
    child.stdout.on("data", (data: Buffer) => {
      const text = data.toString();
      stdout = (stdout + text).slice(-100000);
      pending += text;
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines)
        if (line.startsWith("out_time_us=")) {
          const seconds = Number(line.slice(12)) / 1000000;
          if (Number.isFinite(seconds)) progress?.(seconds);
        }
    });
    child.stderr.on("data", (data: Buffer) => {
      stderr = (stderr + data.toString()).slice(-4000);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      code === 0
        ? resolve(stdout)
        : reject(new Error(`Media rendering failed: ${stderr}`));
    });
  });
}
const ffmpeg = () => process.env.FFMPEG_PATH || "ffmpeg";
const ffprobe = () => process.env.FFPROBE_PATH || "ffprobe";
const n = (value: number) => value.toFixed(6);
export async function renderTimeline(
  document: Timeline,
  sources: Map<string, string>,
  directory: string,
  progress: (value: number) => void = () => {},
) {
  validateTimeline(document);
  const [width, height] =
    document.aspectRatio === "9:16"
      ? [720, 1280]
      : document.aspectRatio === "16:9"
        ? [1280, 720]
        : [720, 720];
  const normalized: string[] = [];
  for (const [i, clip] of document.clips.entries()) {
    const source = sources.get(clip.assetId);
    if (!source) throw new Error("Source video unavailable.");
    const metadata = JSON.parse(
      await runMediaTool(ffprobe(), [
        "-v",
        "error",
        "-show_streams",
        "-of",
        "json",
        source,
      ]),
    ) as { streams: { codec_type: string }[] };
    const hasAudio = metadata.streams.some((s) => s.codec_type === "audio");
    const output = join(directory, `clip-${i}.mp4`);
    const filters = `[0:v]scale=${Math.ceil((width * clip.zoom) / 2) * 2}:${Math.ceil((height * clip.zoom) / 2) * 2}:force_original_aspect_ratio=increase,crop=${width}:${height}:(iw-ow)*${n(clip.x)}:(ih-oh)*${n(clip.y)},setsar=1,fps=30,settb=AVTB,setpts=PTS-STARTPTS,format=yuv420p[v];${hasAudio ? "[0:a]" : "[1:a]"}atrim=duration=${n(clip.end - clip.start)},asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${n(clip.volume)}[a]`;
    await runMediaTool(ffmpeg(), [
      "-y",
      "-v",
      "error",
      "-threads",
      "2",
      "-filter_complex_threads",
      "1",
      "-ss",
      n(clip.start),
      "-t",
      n(clip.end - clip.start),
      "-i",
      source,
      ...(!hasAudio ? ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"] : []),
      "-filter_complex",
      filters,
      "-map",
      "[v]",
      "-map",
      "[a]",
      "-t",
      n(clip.end - clip.start),
      "-c:v",
      "libx264",
      "-threads",
      "2",
      "-maxrate",
      "8M",
      "-bufsize",
      "16M",
      "-preset",
      "fast",
      "-crf",
      "20",
      "-c:a",
      "aac",
      "-ar",
      "48000",
      "-ac",
      "2",
      output,
    ]);
    normalized.push(output);
    progress(0.05 + (0.45 * (i + 1)) / document.clips.length);
  }
  const inputs = normalized.flatMap((file) => ["-i", file]);
  const filters: string[] = [];
  normalized.forEach((_, i) => {
    filters.push(`[${i}:v]settb=AVTB,setpts=PTS-STARTPTS[v${i}]`);
    filters.push(`[${i}:a]asetpts=PTS-STARTPTS[a${i}]`);
  });
  const layout = timelineLayout(document);
  let video = "v0",
    audio = "a0";
  for (let i = 1; i < normalized.length; i++) {
    const overlap = transitionDuration(document, i - 1);
    if (overlap > 0) {
      filters.push(
        `[${video}][v${i}]xfade=transition=${document.clips[i - 1].transition === "fade" ? "fadeblack" : "fade"}:duration=${n(overlap)}:offset=${n(layout[i].start)}[joinedv${i}]`,
      );
      filters.push(
        `[${audio}][a${i}]acrossfade=d=${n(overlap)}:c1=tri:c2=tri[joineda${i}]`,
      );
    } else
      filters.push(
        `[${video}][${audio}][v${i}][a${i}]concat=n=2:v=1:a=1[joinedv${i}][joineda${i}]`,
      );
    video = `joinedv${i}`;
    audio = `joineda${i}`;
  }
  for (const [i, text] of document.texts.entries()) {
    const file = join(directory, `text-${i}.txt`);
    await writeFile(file, text.text, "utf8");
    const font =
      text.font === "serif"
        ? "DejaVu Serif"
        : text.font === "mono"
          ? "DejaVu Sans Mono"
          : "DejaVu Sans";
    // User text is a UTF-8 file with expansion disabled; it is never an FFmpeg expression or a shell command.
    filters.push(
      `[${video}]drawtext=font='${font}':textfile='${file}':expansion=none:fontsize=${text.size}:fontcolor=${text.color}:box=1:boxcolor=black@0.35:boxborderw=8:x=(w-text_w)*${n(text.x)}:y=(h-text_h)*${n(text.y)}:enable='between(t,${n(text.start)},${n(text.end)})'[textv${i}]`,
    );
    video = `textv${i}`;
  }
  const tracks: string[] = [];
  for (const [i, track] of document.audio.entries()) {
    const source = sources.get(track.assetId);
    if (!source) throw new Error("Music source unavailable.");
    inputs.push("-i", source);
    const duration = track.end - track.start;
    filters.push(
      `[${normalized.length + i}:a]atrim=start=${n(track.start)}:end=${n(track.end)},asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${n(track.volume)},afade=t=in:d=${n(track.fadeIn)},afade=t=out:st=${n(duration - track.fadeOut)}:d=${n(track.fadeOut)},adelay=${Math.round(track.at * 1000)}:all=1[music${i}]`,
    );
    tracks.push(`music${i}`);
  }
  if (tracks.length) {
    filters.push(
      `[${audio}]${tracks.map((t) => `[${t}]`).join("")}amix=inputs=${tracks.length + 1}:duration=first:normalize=0,alimiter=limit=0.95:level=false[mixed]`,
    );
    audio = "mixed";
  }
  const script = join(directory, "filters.txt");
  await writeFile(script, filters.join(";\n"));
  const output = join(directory, "export.mp4");
  await runMediaTool(
    ffmpeg(),
    [
      "-y",
      "-v",
      "error",
      "-threads",
      "2",
      "-filter_complex_threads",
      "1",
      ...inputs,
      "-filter_complex",
      filters.join(";\n"),
      "-map",
      `[${video}]`,
      "-map",
      `[${audio}]`,
      "-t",
      n(timelineDuration(document)),
      "-c:v",
      "libx264",
      "-threads",
      "2",
      "-maxrate",
      "8M",
      "-bufsize",
      "16M",
      "-preset",
      "fast",
      "-crf",
      "20",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-ar",
      "48000",
      "-movflags",
      "+faststart",
      "-progress",
      "pipe:1",
      output,
    ],
    (seconds) => progress(0.5 + (0.45 * seconds) / timelineDuration(document)),
  );
  return output;
}
export const renderExport = internalAction({
  args: { exportId: v.id("timelineExports") },
  handler: async (ctx, args) => {
    const context = await ctx.runMutation(internal.timeline.beginRender, args);
    if (!context) return;
    const directory = await mkdtemp(join(tmpdir(), "virel-edit-"));
    let updates = Promise.resolve();
    let lastUpdate = 0;
    let progressError: unknown;
    try {
      const { client, bucket } = storage();
      const sources = new Map<string, string>();
      for (const [i, asset] of context.assets.entries()) {
        const file = join(directory, `source-${i}`),
          object = await client.send(
            new GetObjectCommand({ Bucket: bucket, Key: asset.key }),
          );
        if (!object.Body || object.ContentLength !== asset.bytes)
          throw new Error("Source media unavailable.");
        let bytes = 0;
        const limit = new Transform({
          transform(chunk: Buffer, _encoding, callback) {
            bytes += chunk.length;
            callback(
              bytes > asset.bytes
                ? new Error("Media download exceeds its registered size.")
                : null,
              chunk,
            );
          },
        });
        await pipeline(object.Body as Readable, limit, createWriteStream(file));
        sources.set(asset._id, file);
      }
      const output = await renderTimeline(
        context.job.document,
        sources,
        directory,
        (progress) => {
          if (Date.now() - lastUpdate < 2000) return;
          lastUpdate = Date.now();
          updates = updates.then(async () => {
            try {
              await ctx.runMutation(internal.timeline.progress, {
                ...args,
                progress,
              });
            } catch (error) {
              progressError = error;
            }
          });
        },
      );
      await updates;
      if (progressError) throw progressError;
      const bytes = (await stat(output)).size;
      if (bytes > 200 * 1024 * 1024) throw new Error("Export is too large.");
      await new Upload({
        client,
        params: {
          Bucket: bucket,
          Key: context.key,
          Body: createReadStream(output),
          ContentType: "video/mp4",
        },
        queueSize: 2,
        leavePartsOnError: false,
      }).done();
      await ctx.runMutation(internal.timeline.completeExport, {
        ...args,
        key: context.key,
        bytes,
      });
    } catch (error) {
      await updates.catch(() => {});
      const message = error instanceof Error ? error.message : "";
      if (
        /Media rendering|ENOENT|Source |Music |Export is too large/.test(
          message,
        )
      ) {
        await ctx.runMutation(internal.timeline.failExport, {
          ...args,
          error: /ENOENT/.test(message)
            ? "Video export service is not ready. Please try again later."
            : "Export could not finish. Check your media and try again.",
        });
      } else throw error; // Transient storage/backend failures retain the durable task for retry.
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
});

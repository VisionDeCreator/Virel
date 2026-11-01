export type TimelineClip = {
  id: string;
  assetId: string;
  start: number;
  end: number;
  volume: number;
  zoom: number;
  x: number;
  y: number;
  transition: "cut" | "fade" | "crossfade";
  transitionDuration: number;
};
export type TimelineText = {
  id: string;
  text: string;
  start: number;
  end: number;
  x: number;
  y: number;
  size: number;
  color: string;
  font: "sans" | "serif" | "mono";
};
export type TimelineAudio = {
  id: string;
  assetId: string;
  start: number;
  end: number;
  at: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
};
export type Timeline = {
  aspectRatio: "9:16" | "16:9" | "1:1";
  clips: TimelineClip[];
  texts: TimelineText[];
  audio: TimelineAudio[];
};
export const emptyTimeline: Timeline = {
  aspectRatio: "9:16",
  clips: [],
  texts: [],
  audio: [],
};
export const timelineLimits = {
  clips: 20,
  texts: 30,
  audio: 8,
  duration: 120,
  assets: 12,
  bytes: 500 * 1024 * 1024,
};
export function clipDuration(c: TimelineClip) {
  return c.end - c.start;
}
export function transitionDuration(t: Timeline, index: number) {
  const clip = t.clips[index],
    next = t.clips[index + 1];
  return next && clip.transition !== "cut" ? clip.transitionDuration : 0;
}
export function timelineLayout(t: Timeline) {
  let at = 0;
  return t.clips.map((clip, index) => {
    const start = at;
    at += clipDuration(clip) - transitionDuration(t, index);
    return { clip, start, end: start + clipDuration(clip) };
  });
}
export function timelineDuration(t: Timeline) {
  const layout = timelineLayout(t);
  return layout.at(-1)?.end ?? 0;
}
export function newTimelineClip(
  assetId: string,
  duration: number,
  id: string,
): TimelineClip {
  return {
    id,
    assetId,
    start: 0,
    end: Math.min(duration, 120),
    volume: 1,
    zoom: 1,
    x: 0.5,
    y: 0.5,
    transition: "cut",
    transitionDuration: 0,
  };
}
function range(n: number, min: number, max: number) {
  return Number.isFinite(n) && n >= min && n <= max;
}
export function validateTimeline(t: Timeline, allowEmpty = false) {
  if (
    !["9:16", "16:9", "1:1"].includes(t.aspectRatio) ||
    t.clips.length > timelineLimits.clips ||
    t.texts.length > timelineLimits.texts ||
    t.audio.length > timelineLimits.audio ||
    (!allowEmpty && !t.clips.length)
  )
    throw new Error("Use 1–20 clips, up to 30 text layers and 8 music tracks.");
  const ids = [...t.clips, ...t.texts, ...t.audio].map((c) => c.id);
  if (
    ids.some((id) => !/^[\w-]{1,100}$/.test(id)) ||
    new Set(ids).size !== ids.length
  )
    throw new Error("Invalid timeline item identifiers.");
  for (const [index, c] of t.clips.entries()) {
    if (
      !c.assetId ||
      !range(c.start, 0, 120) ||
      !range(c.end, c.start + 0.1, 120) ||
      !range(c.volume, 0, 1) ||
      !range(c.zoom, 1, 3) ||
      !range(c.x, 0, 1) ||
      !range(c.y, 0, 1) ||
      !["cut", "fade", "crossfade"].includes(c.transition) ||
      !range(c.transitionDuration, 0, 2)
    )
      throw new Error("Check clip trim, crop, volume and transition settings.");
    const overlap = transitionDuration(t, index);
    const incoming = index ? transitionDuration(t, index - 1) : 0;
    if (
      (c.transition !== "cut" && t.clips[index + 1] && overlap < 0.1) ||
      overlap + incoming > clipDuration(c) - 0.05 ||
      (t.clips[index + 1] && overlap > clipDuration(t.clips[index + 1]) - 0.05)
    )
      throw new Error(
        "Transitions must fit inside their adjoining clips without overlapping each other.",
      );
  }
  const duration = timelineDuration(t);
  if (duration > timelineLimits.duration)
    throw new Error("Keep your edited video within 120 seconds.");
  for (const text of t.texts)
    if (
      !text.text.trim() ||
      text.text.length > 300 ||
      !range(text.start, 0, duration) ||
      !range(text.end, text.start + 0.1, duration) ||
      !range(text.x, 0, 1) ||
      !range(text.y, 0, 1) ||
      !range(text.size, 12, 120) ||
      !/^#[\da-f]{6}$/i.test(text.color) ||
      !["sans", "serif", "mono"].includes(text.font)
    )
      throw new Error("Check text content, position and timing.");
  for (const a of t.audio)
    if (
      !a.assetId ||
      !range(a.start, 0, 600) ||
      !range(a.end, a.start + 0.1, 600) ||
      !range(a.at, 0, duration - 0.1) ||
      a.at + a.end - a.start > duration + 0.001 ||
      !range(a.volume, 0, 1) ||
      !range(a.fadeIn, 0, (a.end - a.start) / 2) ||
      !range(a.fadeOut, 0, (a.end - a.start) / 2)
    )
      throw new Error("Check music trim, timeline position, volume and fades.");
}
export function splitTimelineClip(
  t: Timeline,
  id: string,
  at: number,
  nextId: string,
): Timeline {
  const index = t.clips.findIndex((c) => c.id === id),
    clip = t.clips[index];
  if (!clip || at < clip.start + 0.1 || at > clip.end - 0.1)
    throw new Error("Place the split inside the selected clip.");
  const clips = [...t.clips];
  clips.splice(
    index,
    1,
    { ...clip, end: at, transition: "cut", transitionDuration: 0 },
    { ...clip, id: nextId, start: at },
  );
  return { ...t, clips };
}
export function validateEditorUpload(type: string, bytes: number) {
  const audio = [
    "audio/mpeg",
    "audio/mp3",
    "audio/mp4",
    "audio/x-m4a",
    "audio/wav",
    "audio/x-wav",
    "audio/ogg",
  ].includes(type);
  if (!audio)
    throw new Error(
      "Only music can be imported. The editor uses your generated video only.",
    );
  if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > 50 * 1024 * 1024)
    throw new Error("Use music under 50 MB.");
  return "audio" as const;
}

export function fitTimelineLayers(t: Timeline): Timeline {
  const duration = Math.max(0, timelineDuration(t));
  return {
    ...t,
    texts: t.texts
      .filter((text) => text.start < duration - 0.1)
      .map((text) => ({ ...text, end: Math.min(text.end, duration) })),
    audio: t.audio
      .filter((a) => a.at < duration - 0.1)
      .map((a) => {
        const end = Math.min(a.end, a.start + duration - a.at);
        return {
          ...a,
          end,
          fadeIn: Math.min(a.fadeIn, (end - a.start) / 2),
          fadeOut: Math.min(a.fadeOut, (end - a.start) / 2),
        };
      }),
  };
}

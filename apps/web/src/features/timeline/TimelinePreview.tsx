import { useEffect, useRef } from "react";
import {
  timelineDuration,
  timelineLayout,
  transitionDuration,
  type Timeline,
} from "@virel/shared";
function Media({
  url,
  at,
  playing,
  volume,
  video,
  style,
}: {
  url: string;
  at: number;
  playing: boolean;
  volume: number;
  video?: boolean;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  useEffect(() => {
    const media = ref.current;
    if (!media) return;
    media.volume = Math.max(0, Math.min(1, volume));
    if (Number.isFinite(at) && Math.abs(media.currentTime - at) > 0.3)
      media.currentTime = Math.max(0, at);
    if (playing) void media.play().catch(() => {});
    else media.pause();
  }, [at, playing, volume]);
  useEffect(() => {
    const media = ref.current;
    return () => media?.pause();
  }, []);
  return video ? (
    <video ref={ref} src={url} playsInline preload="auto" style={style} />
  ) : (
    <audio ref={ref} src={url} preload="auto" />
  );
}
export function TimelinePreview({
  document,
  urls,
  time,
  playing,
  seek,
  stop,
}: {
  document: Timeline;
  urls: Record<string, string>;
  time: number;
  playing: boolean;
  seek: (value: number) => void;
  stop: () => void;
}) {
  const duration = timelineDuration(document),
    layout = timelineLayout(document);
  const clock = useRef(time);
  clock.current = time;
  const callbacks = useRef({ seek, stop });
  callbacks.current = { seek, stop };
  useEffect(() => {
    if (!playing) return;
    let last = performance.now(),
      frame: number;
    const tick = (now: number) => {
      const next = clock.current + Math.min(0.1, (now - last) / 1000);
      last = now;
      if (next >= duration) {
        callbacks.current.seek(duration);
        callbacks.current.stop();
        return;
      }
      clock.current = next;
      callbacks.current.seek(next);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, duration]);
  useEffect(() => {
    const pause = () => {
      if (window.document.hidden) callbacks.current.stop();
    };
    window.document.addEventListener("visibilitychange", pause);
    return () => window.document.removeEventListener("visibilitychange", pause);
  }, []);
  const height = document.aspectRatio === "9:16" ? 1280 : 720;
  return (
    <div
      className="timeline-preview"
      style={{
        aspectRatio: document.aspectRatio.replace(":", "/"),
        width:
          document.aspectRatio === "9:16"
            ? 315
            : document.aspectRatio === "16:9"
              ? 560
              : 500,
        maxWidth: "100%",
      }}
      aria-label="Timeline preview"
    >
      {layout
        .filter((row) => time >= row.start && time < row.end)
        .map((row) => {
          const index = document.clips.findIndex((c) => c.id === row.clip.id),
            overlap = index ? transitionDuration(document, index - 1) : 0;
          const p = overlap ? Math.min(1, (time - row.start) / overlap) : 1;
          const opacity =
            index && overlap
              ? document.clips[index - 1].transition === "fade"
                ? Math.max(0, p * 2 - 1)
                : p
              : 1;
          const outgoing = transitionDuration(document, index),
            outgoingP = outgoing
              ? Math.max(0, (time - (row.end - outgoing)) / outgoing)
              : 0;
          const brightness =
            row.clip.transition === "fade" ? 1 - Math.min(1, outgoingP * 2) : 1;
          return (
            urls[row.clip.assetId] && (
              <Media
                key={row.clip.id}
                video
                url={urls[row.clip.assetId]}
                at={row.clip.start + time - row.start}
                playing={playing}
                volume={row.clip.volume * p * (1 - outgoingP)}
                style={{
                  opacity,
                  objectPosition: `${row.clip.x * 100}% ${row.clip.y * 100}%`,
                  transform: `scale(${row.clip.zoom})`,
                  transformOrigin: `${row.clip.x * 100}% ${row.clip.y * 100}%`,
                  filter: `brightness(${brightness})`,
                }}
              />
            )
          );
        })}
      {document.texts
        .filter((text) => time >= text.start && time < text.end)
        .map((text) => (
          <span
            className="timeline-preview-text"
            key={text.id}
            style={{
              left: `${text.x * 100}%`,
              top: `${text.y * 100}%`,
              transform: `translate(-${text.x * 100}%, -${text.y * 100}%)`,
              color: text.color,
              fontFamily:
                text.font === "serif"
                  ? "serif"
                  : text.font === "mono"
                    ? "monospace"
                    : "sans-serif",
              fontSize: `${(text.size / height) * 100}cqh`,
            }}
          >
            {text.text}
          </span>
        ))}
      {document.audio
        .filter((a) => time >= a.at && time < a.at + a.end - a.start)
        .map((a) => {
          const local = time - a.at,
            duration = a.end - a.start;
          const fade = Math.min(
            a.fadeIn ? local / a.fadeIn : 1,
            a.fadeOut ? (duration - local) / a.fadeOut : 1,
            1,
          );
          return (
            urls[a.assetId] && (
              <Media
                key={a.id}
                url={urls[a.assetId]}
                at={a.start + local}
                playing={playing}
                volume={a.volume * fade}
              />
            )
          );
        })}
    </div>
  );
}

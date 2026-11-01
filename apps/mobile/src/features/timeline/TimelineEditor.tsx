import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  Alert,
  AppState,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
import {
  api,
  usePaginatedQuery,
  useTimeline,
  type Id,
} from "@virel/api-client";
import {
  fitTimelineLayers,
  timelineDuration,
  timelineLayout,
  transitionDuration,
  splitTimelineClip,
  type Timeline,
  type TimelineText,
} from "@virel/shared";
import { Button, Panel, SegmentedControl } from "@virel/ui-native";
import { colors } from "@virel/design-tokens";
import { styles } from "../../components/Screen";
import * as Crypto from "expo-crypto";
const uid = () => Crypto.randomUUID();
function NumberField({
  label,
  value,
  change,
}: {
  label: string;
  value: number;
  change: (value: number) => void;
}) {
  const [text, setText] = useState(String(Number(value.toFixed(3))));
  useEffect(() => setText(String(Number(value.toFixed(3)))), [value]);
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        style={styles.input}
        keyboardType="decimal-pad"
        value={text}
        onChangeText={(value) => {
          setText(value);
          if (
            value.trim() &&
            !value.endsWith(".") &&
            Number.isFinite(Number(value))
          )
            change(Number(value));
        }}
        onEndEditing={() => {
          const n = Number(text);
          if (Number.isFinite(n) && text.trim()) change(n);
          else setText(String(value));
        }}
      />
    </View>
  );
}
function PreviewMedia({
  url,
  at,
  playing,
  volume,
  video,
  opacity = 1,
  zoom = 1,
  x = 0.5,
  y = 0.5,
  frame,
  sourceWidth = 720,
  sourceHeight = 1280,
  shade = 0,
}: {
  url: string;
  at: number;
  playing: boolean;
  volume: number;
  video?: boolean;
  opacity?: number;
  zoom?: number;
  x?: number;
  y?: number;
  frame?: { width: number; height: number };
  sourceWidth?: number;
  sourceHeight?: number;
  shade?: number;
}) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
    p.muted = volume === 0;
  });
  useEffect(() => {
    player.volume = Math.max(0, Math.min(1, volume));
    player.muted = volume === 0;
    if (Math.abs(player.currentTime - at) > 0.3)
      player.currentTime = Math.max(0, at);
    if (playing && AppState.currentState === "active") player.play();
    else player.pause();
  }, [at, playing, volume, player]);
  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) => {
      if (state !== "active") player.pause();
    });
    return () => listener.remove();
  }, [player]);
  const scale = frame
    ? Math.max(frame.width / sourceWidth, frame.height / sourceHeight) * zoom
    : 1;
  return video ? (
    <View
      pointerEvents="none"
      style={{ position: "absolute", inset: 0, opacity }}
    >
      <VideoView
        player={player}
        nativeControls={false}
        surfaceType="textureView"
        contentFit="fill"
        style={{
          position: "absolute",
          width: frame ? sourceWidth * scale : "100%",
          height: frame ? sourceHeight * scale : "100%",
          left: frame ? (frame.width - sourceWidth * scale) * x : 0,
          top: frame ? (frame.height - sourceHeight * scale) * y : 0,
        }}
      />
      {shade > 0 && (
        <View
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: "#000",
            opacity: shade,
          }}
        />
      )}
    </View>
  ) : null;
}
function Caption({
  text,
  width,
  height,
  canvasHeight,
}: {
  text: TimelineText;
  width: number;
  height: number;
  canvasHeight: number;
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  return (
    <Text
      onLayout={(e) =>
        setSize({
          width: e.nativeEvent.layout.width,
          height: e.nativeEvent.layout.height,
        })
      }
      style={{
        position: "absolute",
        left: Math.max(0, (width - size.width) * text.x),
        top: Math.max(0, (height - size.height) * text.y),
        color: text.color,
        backgroundColor: "#0006",
        padding: 4,
        maxWidth: "95%",
        fontSize: (text.size / canvasHeight) * height,
        fontFamily:
          text.font === "mono"
            ? "monospace"
            : text.font === "serif"
              ? "serif"
              : undefined,
      }}
    >
      {text.text}
    </Text>
  );
}
export function NativeTimelineEditor({
  projectId,
  back,
}: {
  projectId: Id<"timelineProjects">;
  back: () => void;
}) {
  const editor = useTimeline(projectId, AsyncStorage),
    { document, assets, project } = editor;
  const [selected, setSelected] = useState<string | null>(null),
    [time, setTime] = useState(0),
    [playing, setPlaying] = useState(false),
    [zoom, setZoom] = useState(40),
    [snap, setSnap] = useState(true);
  const [description, setDescription] = useState(""),
    [remixEnabled, setRemixEnabled] = useState(true);
  const [size, setSize] = useState({ width: 300, height: 400 });
  const duration = timelineDuration(document),
    layout = timelineLayout(document),
    clip = document.clips.find((c) => c.id === selected);
  const clock = useRef(time);
  clock.current = time;
  useFocusEffect(useCallback(() => () => setPlaying(false), []));
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") setPlaying(false);
    });
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (!playing) return;
    let last = Date.now();
    const timer = setInterval(() => {
      const now = Date.now(),
        next = clock.current + Math.min(0.1, (now - last) / 1000);
      last = now;
      if (next >= duration) {
        setTime(duration);
        setPlaying(false);
      } else setTime(next);
    }, 33);
    return () => clearInterval(timer);
  }, [playing, duration]);
  function change(next: Timeline) {
    setPlaying(false);
    editor.change(next);
    setTime(Math.min(time, timelineDuration(next)));
  }
  function move(delta: number) {
    if (!clip) return;
    const clips = [...document.clips],
      index = clips.findIndex((c) => c.id === clip.id),
      target = index + delta;
    if (target < 0 || target >= clips.length) return;
    [clips[index], clips[target]] = [clips[target], clips[index]];
    change({ ...document, clips });
  }
  function seek(value: number) {
    const boundary = layout
      .flatMap((r) => [r.start, r.end])
      .find((b) => Math.abs(b - value) < 0.12);
    setPlaying(false);
    setTime(
      Math.max(
        0,
        Math.min(duration, snap && boundary !== undefined ? boundary : value),
      ),
    );
  }
  async function upload() {
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ["audio/*"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (picked.canceled) return;
      const item = picked.assets[0],
        type =
          item.mimeType ??
          (/\.m4a$/i.test(item.name)
            ? "audio/mp4"
            : /\.mp3$/i.test(item.name)
              ? "audio/mpeg"
              : "application/octet-stream");
      await editor.upload(
        { name: item.name, type, bytes: item.size ?? 0 },
        async (url) => {
          const result = await FileSystem.uploadAsync(url, item.uri, {
            httpMethod: "PUT",
            uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
            headers: { "Content-Type": type },
          });
          if (result.status < 200 || result.status >= 300)
            throw new Error("Upload failed. Please try again.");
        },
      );
    } catch {
      Alert.alert("Import failed", "Please select the media again.");
    }
  }
  if (!editor.ready) return <Text style={styles.text}>Opening timeline…</Text>;
  const currentExport = project?.latestExport,
    fresh = currentExport?.revision === project?.revision && !editor.dirty;
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: 50 }}
      >
        <Button
          title="← Your creations"
          variant="secondary"
          onPress={() => {
            setPlaying(false);
            void editor.run(async () => {
              await editor.flush();
              back();
            });
          }}
        />
        <Text style={styles.heading}>Timeline editor</Text>
        <Text style={styles.text}>
          Manual editing · No generation or credit charge · One creator lineage
          · Up to 120 seconds
        </Text>
        <TextInput
          accessibilityLabel="Project title"
          style={styles.input}
          value={editor.title}
          maxLength={100}
          onChangeText={editor.setTitle}
        />
        <Text accessibilityLiveRegion="polite" style={styles.text}>
          {editor.saving ? "Saving…" : editor.dirty ? "Unsaved edits" : "Saved"}
        </Text>
        {editor.recovery && (
          <Panel>
            <Text style={styles.text}>Local edits were recovered.</Text>
            <Button title="Restore local edits" onPress={editor.restore} />
          </Panel>
        )}
        {!!editor.error && (
          <Panel>
            <Text accessibilityRole="alert" style={styles.text}>
              {editor.error}
            </Text>
            <Button
              title="Retry save"
              onPress={() => void editor.run(editor.flush)}
            />
            <Button title="Reload saved version" onPress={editor.reload} />
          </Panel>
        )}
        <View
          onLayout={(e) =>
            setSize({
              width: e.nativeEvent.layout.width,
              height: e.nativeEvent.layout.height,
            })
          }
          style={{
            width: "100%",
            aspectRatio:
              document.aspectRatio === "9:16"
                ? 9 / 16
                : document.aspectRatio === "16:9"
                  ? 16 / 9
                  : 1,
            maxHeight: 500,
            maxWidth: document.aspectRatio === "9:16" ? 281 : undefined,
            alignSelf: "center",
            backgroundColor: "#000",
            overflow: "hidden",
            borderRadius: 12,
          }}
        >
          {layout
            .filter((r) => time >= r.start && time < r.end)
            .map((row) => {
              const index = document.clips.findIndex(
                  (c) => c.id === row.clip.id,
                ),
                overlap = index ? transitionDuration(document, index - 1) : 0,
                p = overlap ? Math.min(1, (time - row.start) / overlap) : 1;
              return (
                editor.urls[row.clip.assetId] && (
                  <PreviewMedia
                    key={row.clip.id}
                    video
                    url={editor.urls[row.clip.assetId]}
                    at={row.clip.start + time - row.start}
                    playing={playing}
                    volume={
                      row.clip.volume *
                      p *
                      (1 -
                        (transitionDuration(document, index)
                          ? Math.max(
                              0,
                              (time -
                                (row.end -
                                  transitionDuration(document, index))) /
                                transitionDuration(document, index),
                            )
                          : 0))
                    }
                    opacity={
                      overlap && document.clips[index - 1].transition === "fade"
                        ? Math.max(0, p * 2 - 1)
                        : p
                    }
                    shade={
                      row.clip.transition === "fade" &&
                      transitionDuration(document, index)
                        ? Math.min(
                            1,
                            Math.max(
                              0,
                              (time -
                                row.end +
                                transitionDuration(document, index)) /
                                transitionDuration(document, index),
                            ) * 2,
                          )
                        : 0
                    }
                    zoom={row.clip.zoom}
                    x={row.clip.x}
                    y={row.clip.y}
                    frame={size}
                    sourceWidth={
                      assets?.find((a) => a._id === row.clip.assetId)?.width
                    }
                    sourceHeight={
                      assets?.find((a) => a._id === row.clip.assetId)?.height
                    }
                  />
                )
              );
            })}
          {document.texts
            .filter((t) => time >= t.start && time < t.end)
            .map((text) => (
              <Caption
                key={text.id}
                text={text}
                width={size.width}
                height={size.height}
                canvasHeight={document.aspectRatio === "9:16" ? 1280 : 720}
              />
            ))}
          {document.audio
            .filter((a) => time >= a.at && time < a.at + a.end - a.start)
            .map((a) => {
              const local = time - a.at,
                remaining = a.end - a.start - local;
              const volume =
                a.volume *
                Math.min(
                  1,
                  a.fadeIn ? local / a.fadeIn : 1,
                  a.fadeOut ? remaining / a.fadeOut : 1,
                );
              return (
                editor.urls[a.assetId] && (
                  <PreviewMedia
                    key={a.id}
                    url={editor.urls[a.assetId]}
                    at={a.start + local}
                    playing={playing}
                    volume={volume}
                  />
                )
              );
            })}
        </View>
        <Button
          title={playing ? "Pause" : "Play"}
          disabled={!duration}
          onPress={() => {
            if (time >= duration) setTime(0);
            setPlaying(!playing);
          }}
        />
        <Text style={styles.text}>
          {time.toFixed(1)} / {duration.toFixed(1)}s
        </Text>
        <NumberField label="Playhead (s)" value={time} change={seek} />
        <SegmentedControl
          label="Canvas"
          options={[
            { value: "9:16", label: "Portrait" },
            { value: "16:9", label: "Landscape" },
            { value: "1:1", label: "Square" },
          ]}
          value={document.aspectRatio}
          onChange={(aspectRatio) => change({ ...document, aspectRatio })}
        />
        <View style={{ flexDirection: "row", gap: 12 }}>
          <Button
            title="Undo"
            disabled={!editor.canUndo}
            onPress={editor.undo}
          />
          <Button
            title="Redo"
            disabled={!editor.canRedo}
            onPress={editor.redo}
          />
        </View>
        <Text accessibilityRole="header" style={styles.label}>
          Timeline
        </Text>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <Button
            title="Zoom −"
            onPress={() => setZoom(Math.max(20, zoom - 10))}
          />
          <Button
            title="Zoom +"
            onPress={() => setZoom(Math.min(120, zoom + 10))}
          />
          <Button
            title={snap ? "Snapping on" : "Snapping off"}
            onPress={() => setSnap(!snap)}
          />
        </View>
        <ScrollView horizontal>
          <View style={{ width: Math.max(300, duration * zoom), height: 185 }}>
            <View style={{ height: 30 }}>
              {Array.from({ length: Math.ceil(duration) + 1 }, (_, i) => (
                <Pressable
                  accessibilityLabel={`Seek to ${i} seconds`}
                  key={i}
                  onPress={() => seek(i)}
                  style={{ position: "absolute", left: i * zoom, padding: 4 }}
                >
                  <Text style={styles.text}>{i}s</Text>
                </Pressable>
              ))}
            </View>
            <View style={{ height: 55 }}>
              {layout.map((r, i) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: selected === r.clip.id }}
                  key={r.clip.id}
                  onPress={() => {
                    setSelected(r.clip.id);
                    seek(r.start);
                  }}
                  style={{
                    position: "absolute",
                    left: r.start * zoom,
                    width: (r.end - r.start) * zoom,
                    height: 50,
                    borderWidth: 2,
                    borderColor:
                      selected === r.clip.id ? colors.primary : colors.border,
                    backgroundColor: "#75421f",
                    padding: 8,
                  }}
                >
                  {editor.urls[r.clip.assetId] && (
                    <NativeThumbnail
                      url={editor.urls[r.clip.assetId]}
                      at={r.clip.start}
                    />
                  )}
                  <Text numberOfLines={1} style={styles.label}>
                    {i + 1} ·{" "}
                    {assets?.find((a) => a._id === r.clip.assetId)?.name ??
                      "Clip"}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={{ height: 44 }}>
              {document.texts.map((t) => (
                <View
                  key={t.id}
                  style={{
                    position: "absolute",
                    left: t.start * zoom,
                    width: (t.end - t.start) * zoom,
                    height: 38,
                    backgroundColor: "#453861",
                    padding: 5,
                  }}
                >
                  <Text numberOfLines={1} style={styles.label}>
                    {t.text}
                  </Text>
                </View>
              ))}
            </View>
            <View style={{ height: 44 }}>
              {document.audio.map((a) => (
                <View
                  key={a.id}
                  style={{
                    position: "absolute",
                    left: a.at * zoom,
                    width: (a.end - a.start) * zoom,
                    height: 38,
                    backgroundColor: "#24564a",
                    padding: 5,
                  }}
                >
                  <Text style={styles.label}>♫ Music</Text>
                </View>
              ))}
            </View>
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: time * zoom,
                width: 2,
                backgroundColor: "#fff",
              }}
            />
          </View>
        </ScrollView>
        {clip && (
          <Panel>
            <Text style={styles.label}>Selected clip</Text>
            {(
              [
                ["Trim start (s)", "start"],
                ["Trim end (s)", "end"],
                ["Clip volume", "volume"],
                ["Crop zoom", "zoom"],
                ["Crop horizontal", "x"],
                ["Crop vertical", "y"],
              ] as const
            ).map(([label, key]) => (
              <NumberField
                key={key}
                label={label}
                value={clip[key]}
                change={(value) => editor.updateClip(clip.id, { [key]: value })}
              />
            ))}
            <Button
              title={clip.volume === 0 ? "Unmute clip" : "Mute original audio"}
              onPress={() =>
                editor.updateClip(clip.id, {
                  volume: clip.volume === 0 ? 1 : 0,
                })
              }
            />
            <SegmentedControl
              label="Transition"
              options={[
                { value: "cut", label: "Cut" },
                { value: "fade", label: "Fade" },
                { value: "crossfade", label: "Crossfade" },
              ]}
              value={clip.transition}
              onChange={(transition) =>
                editor.updateClip(clip.id, {
                  transition,
                  transitionDuration: transition === "cut" ? 0 : 0.3,
                })
              }
            />
            {clip.transition !== "cut" && (
              <NumberField
                label="Transition seconds"
                value={clip.transitionDuration}
                change={(transitionDuration) =>
                  editor.updateClip(clip.id, { transitionDuration })
                }
              />
            )}
            <Button
              title="Split at playhead"
              onPress={() =>
                void editor.run(async () => {
                  const row = layout.find((r) => r.clip.id === clip.id)!;
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
            />
            <Button
              title="Duplicate clip"
              onPress={() =>
                change({
                  ...document,
                  clips: document.clips.flatMap((c) =>
                    c.id === clip.id ? [c, { ...c, id: uid() }] : [c],
                  ),
                })
              }
            />
            <Button title="Move earlier" onPress={() => move(-1)} />
            <Button title="Move later" onPress={() => move(1)} />
            <Button
              title="Delete clip"
              onPress={() => {
                change(
                  fitTimelineLayers({
                    ...document,
                    clips: document.clips.filter((c) => c.id !== clip.id),
                  }),
                );
                setSelected(null);
              }}
            />
          </Panel>
        )}
        <Panel>
          <Text style={styles.label}>Your media</Text>
          <Button
            title="Import music"
            disabled={editor.busy}
            onPress={() => void upload()}
          />
          {assets
            ?.filter((a) => a.type === "audio")
            .map((a) => (
              <View key={a._id} style={{ gap: 8, paddingVertical: 8 }}>
                <Text style={styles.text}>
                  {a.name} · {a.duration?.toFixed(1)}s
                </Text>
                <Button
                  title="Add music"
                  disabled={!a.duration || editor.busy}
                  onPress={() => {
                    if (!a.duration) return;
                    const id = uid();
                    if (a.type === "audio") {
                      const length = Math.min(duration, a.duration);
                      if (!length) return;
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
                />
              </View>
            ))}
        </Panel>
        <Button
          title="Add text"
          disabled={!duration}
          onPress={() =>
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
        />
        {document.texts.map((text) => {
          const update = (patch: Partial<typeof text>) =>
            change({
              ...document,
              texts: document.texts.map((t) =>
                t.id === text.id ? { ...t, ...patch } : t,
              ),
            });
          return (
            <Panel key={text.id}>
              <TextInput
                accessibilityLabel="Text content"
                style={styles.input}
                value={text.text}
                maxLength={300}
                onChangeText={(value) => update({ text: value })}
              />
              {(
                [
                  ["Text start (s)", "start"],
                  ["Text end (s)", "end"],
                  ["Text horizontal", "x"],
                  ["Text vertical", "y"],
                  ["Font size", "size"],
                ] as const
              ).map(([label, key]) => (
                <NumberField
                  key={key}
                  label={label}
                  value={text[key]}
                  change={(value) => update({ [key]: value })}
                />
              ))}
              <TextInput
                accessibilityLabel="Text color (hex)"
                style={styles.input}
                value={text.color}
                maxLength={7}
                onChangeText={(color) => update({ color })}
              />
              <SegmentedControl
                label="Font"
                options={[
                  { value: "sans", label: "Sans" },
                  { value: "serif", label: "Serif" },
                  { value: "mono", label: "Mono" },
                ]}
                value={text.font}
                onChange={(font) => update({ font })}
              />
              <Button
                title="Remove text"
                onPress={() =>
                  change({
                    ...document,
                    texts: document.texts.filter((t) => t.id !== text.id),
                  })
                }
              />
            </Panel>
          );
        })}
        {document.audio.map((a) => (
          <Panel key={a.id}>
            <Text style={styles.label}>Music</Text>
            {(
              [
                ["Music trim start (s)", "start"],
                ["Music trim end (s)", "end"],
                ["Music timeline start (s)", "at"],
                ["Music volume", "volume"],
                ["Fade in (s)", "fadeIn"],
                ["Fade out (s)", "fadeOut"],
              ] as const
            ).map(([label, key]) => (
              <NumberField
                key={key}
                label={label}
                value={a[key]}
                change={(value) =>
                  change({
                    ...document,
                    audio: document.audio.map((track) =>
                      track.id === a.id ? { ...track, [key]: value } : track,
                    ),
                  })
                }
              />
            ))}
            <Button
              title="Remove music"
              onPress={() =>
                change({
                  ...document,
                  audio: document.audio.filter((track) => track.id !== a.id),
                })
              }
            />
          </Panel>
        ))}
        <Button
          title="Export video"
          disabled={editor.busy || !document.clips.length}
          onPress={() => {
            setPlaying(false);
            void editor.export();
          }}
        />
        {currentExport && (
          <Panel>
            <Text style={styles.label}>Export</Text>
            <Text accessibilityLiveRegion="polite" style={styles.text}>
              {currentExport.status === "ready"
                ? fresh
                  ? "Your edited video is ready."
                  : "Export again to include your latest changes."
                : currentExport.status === "failed"
                  ? currentExport.error
                  : `${currentExport.status} · ${Math.round(currentExport.progress * 100)}%`}
            </Text>
            {currentExport.status === "failed" && (
              <Button
                title="Retry export"
                onPress={() => void editor.export()}
              />
            )}{" "}
            {currentExport.status === "ready" && (
              <>
                <NativeExportPreview
                  url={editor.urls[currentExport.assetId!]}
                />
                <Button
                  title="Download edited video"
                  onPress={() =>
                    void editor
                      .download()
                      .then(async (url) => {
                        if (!url) return;
                        const destination = `${FileSystem.cacheDirectory}edited-${currentExport._id}.mp4`;
                        await FileSystem.downloadAsync(url, destination);
                        if (await Sharing.isAvailableAsync())
                          await Sharing.shareAsync(destination, {
                            mimeType: "video/mp4",
                          });
                      })
                      .catch(() =>
                        Alert.alert("Download failed", "Please try again."),
                      )
                  }
                />
                <TextInput
                  accessibilityLabel="Description"
                  style={styles.input}
                  value={description}
                  maxLength={2000}
                  onChangeText={setDescription}
                />
                <Button
                  title={
                    duration > 15
                      ? "AI remixes require 15 seconds or less"
                      : remixEnabled
                        ? "Remixes allowed"
                        : "Remixes disabled"
                  }
                  disabled={duration > 15}
                  onPress={() => setRemixEnabled(!remixEnabled)}
                />
                <Button
                  title="Publish edited video"
                  disabled={!fresh || editor.busy}
                  onPress={() =>
                    void editor
                      .publish(description, remixEnabled && duration <= 15)
                      .then((id) => {
                        if (id)
                          Alert.alert(
                            "Published",
                            "Your edited video is now in the feed.",
                          );
                      })
                  }
                />
              </>
            )}
          </Panel>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
function NativeExportPreview({ url }: { url?: string }) {
  const player = useVideoPlayer(url ?? null);
  useFocusEffect(useCallback(() => () => player.pause(), [player]));
  return url ? (
    <VideoView
      player={player}
      nativeControls
      style={{ width: "100%", aspectRatio: 9 / 16, maxHeight: 500 }}
    />
  ) : (
    <Text style={styles.text}>Loading export preview…</Text>
  );
}
export function NativeTimelineProjects({
  open,
}: {
  open: (id: string) => void;
}) {
  const {
    results: projects,
    status,
    loadMore,
  } = usePaginatedQuery(api.timeline.list, {}, { initialNumItems: 12 });
  return (
    <View style={{ padding: 20, gap: 12 }}>
      <Text style={styles.heading}>Manual edits</Text>
      <Text style={styles.text}>
        Open a generated video in Your creations to edit its timeline.
      </Text>
      {status === "CanLoadMore" && (
        <Button title="More editing projects" onPress={() => loadMore(12)} />
      )}
      {projects?.map((p) => (
        <Button
          key={p._id}
          title={`${p.title} · ${timelineDuration(p.document).toFixed(1)}s`}
          variant="secondary"
          onPress={() => open(p._id)}
        />
      ))}
    </View>
  );
}

function NativeThumbnail({ url, at }: { url: string; at: number }) {
  const player = useVideoPlayer(url, (p) => {
    p.muted = true;
    p.currentTime = at;
  });
  return (
    <View
      pointerEvents="none"
      style={{ position: "absolute", right: 0, top: 0, opacity: 0.4 }}
    >
      <VideoView
        player={player}
        nativeControls={false}
        surfaceType="textureView"
        contentFit="cover"
        style={{ width: 40, height: 46 }}
      />
    </View>
  );
}

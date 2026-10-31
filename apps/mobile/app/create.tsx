import { useEffect, useRef, useState, useCallback } from "react";
import { Text, View, Switch, AppState, ActivityIndicator } from "react-native";
import { Link, useLocalSearchParams, useFocusEffect } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as Crypto from "expo-crypto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  api,
  useQuery,
  useConvexAuth,
  useStudio,
  type Id,
} from "@virel/api-client";
import { Button, Panel, Field, SegmentedControl } from "@virel/ui-native";
import {
  creationModes,
  generationDurations,
  aspectRatios,
  transformTargets,
  removeReference,
  normalizeStudioDraft,
  referenceLimit,
  bindReference,
  defaultStudioInput,
  type StudioInput,
} from "@virel/shared";
import { colors } from "@virel/design-tokens";
import { Screen, styles } from "../src/components/Screen";
import { NativeScriptEditor } from "../src/features/studio/ScriptEditor";
import { client } from "../src/lib/backend";
function Preview({ url }: { url: string }) {
  const player = useVideoPlayer(url);
  useFocusEffect(useCallback(() => () => player.pause(), [player]));
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") player.pause();
    });
    return () => subscription.remove();
  }, [player]);
  return (
    <VideoView
      player={player}
      style={{ width: "100%", height: 320, borderRadius: 16 }}
      nativeControls
    />
  );
}
function Workspace() {
  const studio = useStudio({ draftStorage: AsyncStorage });
  const { input, change, busy } = studio;
  const params = useLocalSearchParams<{ source?: string }>();
  const sourceId =
    typeof params.source === "string" ? params.source : undefined;
  const source = useQuery(
    api.media.source,
    sourceId ? { videoId: sourceId } : "skip",
  );
  const profile = useQuery(api.profiles.me);
  const importedDraft = useRef(false);
  useEffect(() => {
    const first = studio.scripts.segments?.[0];
    if (
      !profile ||
      !first ||
      importedDraft.current ||
      sourceId ||
      first.revision !== 0
    )
      return;
    importedDraft.current = true;
    void AsyncStorage.getItem(`virel.studio.${profile._id}`)
      .then((saved) => {
        if (saved) {
          try {
            const draft = normalizeStudioDraft(JSON.parse(saved));
            if (draft.mode === input.mode)
              studio.setInput({ ...draft, segmentId: first._id });
          } catch {}
        }
      })
      .catch(() => {});
  }, [profile?._id, studio.scripts.segmentId]);
  const appliedSource = useRef("");
  useEffect(() => {
    if (
      !sourceId ||
      !source ||
      !studio.scripts.segmentId ||
      appliedSource.current === sourceId
    )
      return;
    if (input.mode !== "remix") {
      void studio.run(() => studio.scripts.switchMode("remix"));
      return;
    }
    appliedSource.current = sourceId;
    change({ sourceVideoId: sourceId, sourceAssetId: undefined });
  }, [sourceId, source?._id, input.mode, studio.scripts.segmentId]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(false);
  const visibleJobs = studio.jobs?.filter(
    (job) =>
      (job.input.mode === "remix" ? "remix" : "create") === input.mode &&
      (!job.input.segmentId ||
        job.input.segmentId === studio.scripts.segmentId),
  );
  const selected =
    visibleJobs?.find((j) => j._id === selectedId) ??
    visibleJobs?.find((j) => j.outputAssetId);
  const [url, setUrl] = useState("");
  const assetId = showSource
    ? (input.sourceAssetId ?? input.referenceVideoAssetId)
    : (selected?.outputAssetId ??
      input.sourceAssetId ??
      input.referenceVideoAssetId);
  useEffect(() => {
    let live = true;
    setUrl("");
    const refresh = () => {
      if (assetId)
        void studio
          .preview({ assetId: assetId as Id<"mediaAssets"> })
          .then((value) => {
            if (live) setUrl(value);
          })
          .catch(() => {
            if (live)
              studio.setError(
                "Preview unavailable. Try selecting the result again.",
              );
          });
    };
    refresh();
    const timer = setInterval(refresh, 45 * 60000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [assetId, studio.preview]);
  const picking = useRef(false);
  async function pick(type: "image" | "video") {
    if (busy || picking.current) return;
    picking.current = true;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type:
          type === "video"
            ? ["video/mp4", "video/quicktime", "video/webm"]
            : ["image/jpeg", "image/png", "image/webp"],
        copyToCacheDirectory: true,
        multiple: type === "image",
      });
      if (result.canceled) return;
      const files = result.assets;
      if (files.some((file) => !file.mimeType || !file.size))
        throw new Error("Could not read a file's type or size.");
      setShowSource(true);
      await studio.uploadFiles(
        files.map((file) => ({
          name: file.name,
          type: file.mimeType!,
          bytes: file.size!,
        })),
        async (signedUrl, index, onProgress) => {
          const file = files[index];
          const task = FileSystem.createUploadTask(
            signedUrl,
            file.uri,
            {
              httpMethod: "PUT",
              uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
              headers: { "Content-Type": file.mimeType! },
              sessionType: FileSystem.FileSystemSessionType.BACKGROUND,
            },
            (data) =>
              onProgress(
                Math.round(
                  (data.totalBytesSent / data.totalBytesExpectedToSend) * 100,
                ),
              ),
          );
          const response = await task.uploadAsync();
          if (!response || response.status < 200 || response.status >= 300)
            throw new Error(
              "Upload interrupted. Check your connection and try again.",
            );
        },
      );
      await Promise.all(
        files.map((file) =>
          FileSystem.deleteAsync(file.uri, { idempotent: true }).catch(
            () => {},
          ),
        ),
      );
    } catch (error) {
      studio.setError(
        error instanceof Error ? error.message : "Could not select media.",
      );
    } finally {
      picking.current = false;
    }
  }
  return (
    <Screen title="Your Studio">
      <Panel>
        <Text style={styles.label}>
          {studio.balance?.available ?? 0} credits available
        </Text>
        <Text style={styles.text}>
          {studio.balance?.reserved ?? 0} reserved for running videos
        </Text>
      </Panel>
      <SegmentedControl
        label="Creation mode"
        options={creationModes}
        value={input.mode === "remix" ? "remix" : "create"}
        onChange={(mode) => {
          if (!busy) void studio.run(() => studio.scripts.switchMode(mode));
        }}
      />
      <Panel>
        {studio.uploadStatus && (
          <View style={{ gap: 10, paddingVertical: 12 }}>
            <ActivityIndicator accessibilityLabel="Media upload in progress" />
            <Text accessibilityLiveRegion="polite" style={styles.label}>
              {studio.uploadStatus.phase === "preparing"
                ? "Preparing upload…"
                : studio.uploadStatus.phase === "verifying"
                  ? "Checking your media…"
                  : "Uploading media…"}
            </Text>
            <Text style={styles.text}>
              {studio.uploadStatus.name} · File {studio.uploadStatus.index} of{" "}
              {studio.uploadStatus.total}
            </Text>
            {studio.uploadStatus.phase === "uploading" &&
              studio.uploadStatus.progress !== null && (
                <View
                  accessibilityRole="progressbar"
                  accessibilityLabel="Media upload progress"
                  accessibilityValue={{
                    min: 0,
                    max: 100,
                    now: studio.uploadStatus.progress,
                  }}
                  style={{ gap: 6 }}
                >
                  <View
                    style={{
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: "#655b50",
                      overflow: "hidden",
                    }}
                  >
                    <View
                      style={{
                        width: `${studio.uploadStatus.progress}%`,
                        height: 6,
                        backgroundColor: "#e99555",
                      }}
                    />
                  </View>
                  <Text style={styles.text}>
                    {studio.uploadStatus.progress}% uploaded
                  </Text>
                </View>
              )}
            {studio.uploadStatus.phase === "verifying" && (
              <Text style={styles.text}>
                Upload complete. Checking the file before adding it to your
                references.
              </Text>
            )}
          </View>
        )}
        <Text style={styles.label}>
          Generated videos: 4–15 seconds · 15-second maximum.
        </Text>
        <Text style={styles.text}>
          New Create videos fit the Remix duration limit.
        </Text>
        {(input.mode === "remix" || input.mode === "create") && (
          <>
            <Button
              title={
                input.mode === "remix"
                  ? "Upload source video · required"
                  : "Upload reference video · optional"
              }
              disabled={busy}
              onPress={() => void pick("video")}
            />
            <Text style={styles.text}>
              {input.mode === "remix"
                ? "Required: 4–15 seconds"
                : "Optional reference input: 4–15 seconds"}{" "}
              · up to 200 MB · H.264 video
            </Text>
            {input.sourceVideoId && source && (
              <Text style={styles.text}>
                Remixing “{source.title}” by @
                {source.creator?.username ?? "creator"}. Attribution stays
                attached.
              </Text>
            )}
            {sourceId && source === null && (
              <Text style={styles.text}>
                This source is no longer available for remixing.
              </Text>
            )}
            {studio.assets
              ?.filter((a) => a.type === "video")
              .slice(0, 10)
              .map((a) => (
                <Button
                  key={a._id}
                  title={`${a._id === (input.sourceAssetId ?? input.referenceVideoAssetId) ? "✓ " : ""}${a.name}`}
                  variant="secondary"
                  disabled={busy}
                  onPress={() => change(bindReference(input, a._id, "video"))}
                />
              ))}
          </>
        )}
        <Button
          title={
            input.mode === "create"
              ? "Upload reference images · optional"
              : "Upload reference image"
          }
          disabled={
            busy || input.referenceAssetIds.length >= referenceLimit(input.mode)
          }
          onPress={() => void pick("image")}
        />
        <Text style={styles.text}>
          Up to {referenceLimit(input.mode)} image references. Type @ in your
          script to link media.
        </Text>
        {studio.assets
          ?.filter(
            (a) =>
              a.type === "image" && !input.referenceAssetIds.includes(a._id),
          )
          .slice(0, 8)
          .map((a) => (
            <Button
              key={a._id}
              title={`Add ${a.name}`}
              variant="secondary"
              disabled={
                busy ||
                input.referenceAssetIds.length >= referenceLimit(input.mode)
              }
              onPress={() => change(bindReference(input, a._id, "image"))}
            />
          ))}
        <NativeScriptEditor studio={studio} />
        <Text style={styles.label}>
          Model: {input.mode === "remix" ? "Remix Lite" : "Seedance 2.5"}
        </Text>
        {input.mode === "remix" && (
          <>
            <Text style={styles.label}>What to change</Text>
            {transformTargets.map((t) => (
              <View
                key={t.value}
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Text style={styles.text}>{t.label}</Text>
                <Switch
                  accessibilityLabel={t.label}
                  disabled={busy}
                  value={input.targets.includes(t.value)}
                  onValueChange={(enabled) =>
                    change({
                      targets: enabled
                        ? [...input.targets, t.value]
                        : input.targets.filter((v) => v !== t.value),
                    })
                  }
                />
              </View>
            ))}
            <View
              style={{ flexDirection: "row", justifyContent: "space-between" }}
            >
              <Text style={styles.text}>Follow source camera</Text>
              <Switch
                accessibilityLabel="Follow source camera"
                disabled={busy}
                value={input.preserveCamera}
                onValueChange={(preserveCamera) => change({ preserveCamera })}
              />
            </View>
            <View
              style={{ flexDirection: "row", justifyContent: "space-between" }}
            >
              <Text style={styles.text}>Follow motion and timing</Text>
              <Switch
                accessibilityLabel="Follow motion and timing"
                disabled={busy}
                value={input.preserveMotion}
                onValueChange={(preserveMotion) => change({ preserveMotion })}
              />
            </View>
            <Text style={styles.text}>
              Remix follows the source duration and aspect ratio. Preservation
              guides the AI; it is not an exact pixel lock.
            </Text>
          </>
        )}
        <SegmentedControl
          label="Resolution"
          options={[
            { value: "720p", label: "720p" },
            { value: "1080p", label: "1080p" },
          ]}
          value={input.resolution}
          onChange={(resolution) => {
            if (!busy) change({ resolution });
          }}
        />
        {input.mode !== "remix" && (
          <>
            <Text style={styles.label}>
              Output duration · maximum 15 seconds
            </Text>
            <SegmentedControl
              label="Duration"
              options={generationDurations.map((duration) => ({
                value: String(duration),
                label: `${duration}s`,
              }))}
              value={String(input.duration)}
              onChange={(duration) => {
                if (!busy) change({ duration: Number(duration) });
              }}
            />
            <SegmentedControl
              label="Aspect ratio"
              options={aspectRatios}
              value={input.aspectRatio}
              onChange={(aspectRatio) => {
                if (!busy) change({ aspectRatio });
              }}
            />
          </>
        )}
        {busy && !studio.uploadStatus && (
          <Text accessibilityLiveRegion="polite" style={styles.text}>
            Working…
          </Text>
        )}
        {studio.quote ? (
          <>
            <Text style={styles.text}>
              {studio.quote.duration}s · {studio.quote.credits} credits. Credits
              are reserved now and spent when the result is ready. Promotional
              funding does not earn royalties.
            </Text>
            <Button
              title={`Create video · ${studio.quote.credits} credits`}
              disabled={
                busy || (studio.balance?.available ?? 0) < studio.quote.credits
              }
              onPress={() => void studio.generate(Crypto.randomUUID())}
            />
            {(studio.balance?.available ?? 0) < studio.quote.credits && (
              <Text style={styles.text}>
                Not enough credits. Paid top-ups are not available yet.
              </Text>
            )}
          </>
        ) : (
          <Button
            title="Review credit cost"
            disabled={busy}
            onPress={() => void studio.reviewCost()}
          />
        )}
        {!!studio.error && (
          <Text accessibilityRole="alert" style={{ color: colors.primary }}>
            {studio.error}
          </Text>
        )}
        {!!studio.message && (
          <Text accessibilityLiveRegion="polite" style={styles.text}>
            {studio.message}
          </Text>
        )}
      </Panel>
      <Panel>
        <Text style={styles.label}>Private preview</Text>
        {url ? (
          <Preview key={assetId} url={url} />
        ) : input.sourceVideoId && source ? (
          <Preview url={source.playbackUrl} />
        ) : (
          <Text style={styles.text}>Your next version starts here.</Text>
        )}
        {!showSource && selected?.outputAssetId && (
          <>
            <Button
              title={
                input.mode === "remix"
                  ? "Edit this video with AI"
                  : "Use this video as a reference"
              }
              disabled={busy}
              onPress={() => {
                studio.useVersion(selected);
                setShowSource(true);
              }}
            />
            <Button
              title="Download / share video"
              disabled={busy}
              onPress={() =>
                void studio.run(async () => {
                  const signed = await studio.preview({
                    assetId: selected.outputAssetId!,
                    download: true,
                  });
                  const path = `${FileSystem.cacheDirectory}virel-${selected._id}.mp4`;
                  const downloaded = await FileSystem.downloadAsync(
                    signed,
                    path,
                  );
                  if (downloaded.status !== 200)
                    throw new Error("Download failed. Try again.");
                  if (!(await Sharing.isAvailableAsync()))
                    throw new Error("Sharing is unavailable on this device.");
                  await Sharing.shareAsync(downloaded.uri, {
                    mimeType: "video/mp4",
                    UTI: "public.movie",
                  });
                })
              }
            />
            <PublishForm key={selected._id} job={selected} studio={studio} />
          </>
        )}
      </Panel>
      <Panel>
        <Text style={styles.label}>Your versions</Text>
        {!studio.jobs?.length && (
          <Text style={styles.text}>Your generations will appear here.</Text>
        )}
        {visibleJobs?.map((job) => (
          <View key={job._id} style={{ gap: 8, paddingVertical: 12 }}>
            <Button
              title={job.input.prompt.slice(0, 70)}
              variant="secondary"
              onPress={() => {
                setSelectedId(job._id);
                setShowSource(false);
              }}
            />
            <Text style={styles.text}>
              {job.status.replaceAll("_", " ")} · {job.credits} credits{" "}
              {job.financialState === "released"
                ? "returned"
                : job.financialState}
              {job.video?.status === "published" ? " · Published" : ""}
            </Text>
            {job.error && <Text style={styles.text}>{job.error}</Text>}
            {job.status === "reconciliation_required" && job.providerJobId && (
              <Button
                title="Check again"
                disabled={busy}
                onPress={() =>
                  void studio.run(() => studio.resume({ jobId: job._id }))
                }
              />
            )}
          </View>
        ))}
      </Panel>
      <Panel>
        <Text style={styles.label}>Credit activity</Text>
        {studio.history?.map((event) => (
          <Text key={event._id} style={styles.text}>
            {event.note} · {event.amount > 0 ? "+" : ""}
            {event.amount} credits
          </Text>
        ))}
      </Panel>
    </Screen>
  );
}
function PublishForm({
  job,
  studio,
}: {
  job: NonNullable<ReturnType<typeof useStudio>["jobs"]>[number];
  studio: ReturnType<typeof useStudio>;
}) {
  const [title, setTitle] = useState(job.video?.title ?? "");
  const [description, setDescription] = useState(job.video?.description ?? "");
  const [remixEnabled, setRemixEnabled] = useState(
    job.video?.remixEnabled ?? true,
  );
  return (
    <View style={{ gap: 16 }}>
      <Field
        label="Title"
        value={title}
        onChangeText={setTitle}
        editable={!studio.busy}
        maxLength={100}
      />
      <Field
        label="Description"
        value={description}
        onChangeText={setDescription}
        editable={!studio.busy}
        multiline
        maxLength={2000}
      />
      <Text style={styles.text}>Allow others to remix this video</Text>
      <Switch
        accessibilityLabel="Allow remixes"
        value={remixEnabled}
        disabled={studio.busy}
        onValueChange={setRemixEnabled}
      />
      <Button
        title={
          job.video?.status === "published"
            ? "Update publication"
            : "Publish video"
        }
        disabled={studio.busy || !title.trim()}
        onPress={() =>
          void studio.publish(job._id, title, description, remixEnabled)
        }
      />
      {job.video?.status === "published" && (
        <Button
          title="Unpublish video"
          disabled={studio.busy}
          onPress={() =>
            void studio.run(() => studio.unpublish({ jobId: job._id }))
          }
        />
      )}
      <Text style={styles.text}>
        Publishing makes this video public in the feed and on your profile.
        Existing signed links expire within five minutes of unpublishing.
      </Text>
    </View>
  );
}
function Connected() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  if (isLoading)
    return (
      <Screen title="Your Studio">
        <Text style={styles.text}>Opening Studio…</Text>
      </Screen>
    );
  return isAuthenticated ? (
    <Workspace />
  ) : (
    <Screen title="Your Studio">
      <Text style={styles.text}>
        Sign in to upload, generate, and publish videos.
      </Text>
      <Link href="/profile" style={{ color: colors.primary }}>
        Open your profile to sign in →
      </Link>
    </Screen>
  );
}
export default function Create() {
  return client ? (
    <Connected />
  ) : (
    <Screen title="Your Studio">
      <Text style={styles.text}>
        Connect the backend to upload, generate, and publish videos.
      </Text>
    </Screen>
  );
}

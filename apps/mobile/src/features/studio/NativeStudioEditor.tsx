import { NativeStartingPoint } from "./StartingPoint";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useRef, useState, useCallback } from "react";
import { Text, View, Switch, AppState, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useFocusEffect } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Crypto from "expo-crypto";
import { api, useQuery, useStudio } from "@virel/api-client";
import { Button, Panel, Field, SegmentedControl } from "@virel/ui-native";
import {
  generationDurations,
  aspectRatios,
  transformTargets,
  normalizeStudioDraft,
  referenceLimit,
  bindReference,
} from "@virel/shared";
import { colors } from "@virel/design-tokens";
import { Screen, styles } from "../../components/Screen";
import { NativeScriptEditor } from "./ScriptEditor";
export function Preview({
  url,
  aspectRatio = "9:16",
}: {
  url: string;
  aspectRatio?: string;
}) {
  const [width, height] = aspectRatio.split(":").map(Number);
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
      style={{ width: "100%", aspectRatio: width / height, borderRadius: 16 }}
      nativeControls
    />
  );
}
export function NativeStudioEditor({
  studio,
  onGenerated,
}: {
  studio: ReturnType<typeof useStudio>;
  onGenerated: (id: string) => void;
}) {
  const { input, change, busy } = studio;
  const params = useLocalSearchParams<{
    source?: string;
    asset?: string;
    retry?: string;
  }>();
  const sourceId =
    typeof params.source === "string" ? params.source : undefined;
  const source = useQuery(
    api.media.base,
    sourceId ? { videoId: sourceId } : "skip",
  );
  const profile = useQuery(api.profiles.me);
  const asset = params.asset;
  const retryId = params.retry;
  const retryJob = useQuery(
    api.generation.detail,
    retryId ? { jobId: retryId } : "skip",
  );
  const importedEntry = useRef("");
  useEffect(() => {
    const key = asset || retryId;
    if (!key || importedEntry.current === key || (retryId && !retryJob)) return;
    const mode = asset
      ? "remix"
      : retryJob!.input.mode === "remix"
        ? "remix"
        : "create";
    if (input.mode !== mode) {
      if (!busy) void studio.run(() => studio.scripts.switchMode(mode));
      return;
    }
    const segment = studio.scripts.segments?.find(
      (s) => s._id === studio.scripts.segmentId,
    );
    if (!segment || segment.mode !== mode || input.segmentId !== segment._id)
      return;
    importedEntry.current = key;
    if (asset)
      change({
        ...bindReference(input, asset, "video"),
        sourceVideoId: undefined,
      });
    else
      change({
        ...normalizeStudioDraft(retryJob!.input),
        segmentId: segment._id,
        scriptVersion: undefined,
      });
  }, [
    asset,
    retryId,
    retryJob,
    input.mode,
    input.segmentId,
    studio.scripts.segmentId,
    busy,
  ]);
  const importedDraft = useRef(false);
  useEffect(() => {
    const first = studio.scripts.segments?.[0];
    if (
      !profile ||
      !first ||
      importedDraft.current ||
      asset ||
      retryId ||
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
      busy ||
      !studio.scripts.segmentId ||
      appliedSource.current === sourceId
    )
      return;
    appliedSource.current = sourceId;
    void studio.selectBase(source);
  }, [sourceId, source, busy, studio.scripts.segmentId]);
  const [showReferences, setShowReferences] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
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
    <Screen title="Create a video">
      <Panel>
        <Text style={styles.label}>
          {studio.balance?.available ?? 0} credits available
        </Text>
        <Text style={styles.text}>
          {studio.balance?.reserved ?? 0} reserved for running videos
        </Text>
      </Panel>
      <NativeStartingPoint studio={studio} />
      <Panel>
        <NativeScriptEditor studio={studio} />
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
        <Button
          title={showReferences ? "Hide references" : "Add references"}
          variant="secondary"
          onPress={() => setShowReferences(!showReferences)}
        />
        {(showReferences || input.mode === "remix") && (
          <>
            <Button
              title={
                input.mode === "create"
                  ? "Upload reference images · optional"
                  : "Upload reference images · 1–8 required"
              }
              disabled={
                busy ||
                input.referenceAssetIds.length >= referenceLimit(input.mode)
              }
              onPress={() => void pick("image")}
            />
            <Text style={styles.text}>
              Up to {referenceLimit(input.mode)} image references. Type @ in
              your script to link media.
            </Text>
            {studio.assets
              ?.filter(
                (a) =>
                  a.type === "image" &&
                  !input.referenceAssetIds.includes(a._id),
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
          </>
        )}
        <Text style={styles.label}>
          Model: {input.mode === "remix" ? "Remix Lite" : "Seedance 2.5"}
        </Text>
        {input.mode === "remix" && (
          <Button
            title={
              showAdvanced ? "Hide advanced settings" : "Advanced settings"
            }
            variant="secondary"
            onPress={() => setShowAdvanced(!showAdvanced)}
          />
        )}
        {input.mode === "remix" && showAdvanced && (
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
        {input.mode === "remix" && (
          <Text style={styles.text}>
            {input.duration}s · {input.aspectRatio} · From base video
          </Text>
        )}
        {busy && !studio.uploadStatus && (
          <Text accessibilityLiveRegion="polite" style={styles.text}>
            Working…
          </Text>
        )}
        {studio.quote ? (
          <>
            <Text style={styles.text}>
              {studio.quote.duration}s · {studio.quote.credits.toLocaleString()}{" "}
              credits. Credits are reserved now and spent when the result is
              ready.
            </Text>
            <Text style={styles.text}>
              Includes a $0.015 generation surcharge (
              {studio.quote.surchargeCredits} credits).{" "}
              {studio.quote.rewardMessage}
            </Text>
            <Text style={styles.text}>
              Available after starting:{" "}
              {Math.max(
                0,
                (studio.balance?.available ?? 0) - studio.quote.credits,
              ).toLocaleString()}{" "}
              credits. Quote expires at{" "}
              {new Date(studio.quote.expiresAt).toLocaleTimeString()}.
            </Text>
            <Button
              title={`${input.mode === "remix" ? "Remix video" : "Create video"} · ${studio.quote.credits.toLocaleString()} credits`}
              disabled={
                busy || (studio.balance?.available ?? 0) < studio.quote.credits
              }
              onPress={() =>
                void studio.generate(Crypto.randomUUID()).then((id) => {
                  if (id) onGenerated(id);
                })
              }
            />
            {(studio.balance?.available ?? 0) < studio.quote.credits && (
              <Text style={styles.text}>
                Not enough credits. Paid top-ups are not available yet.
              </Text>
            )}
          </>
        ) : (
          <Button
            title={
              studio.pricingUpdating
                ? "Updating credit pricing…"
                : input.mode === "remix"
                  ? "Review remix cost"
                  : "Review credit cost"
            }
            disabled={busy || studio.pricingUpdating}
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
      <Text style={styles.text}>
        Your video starts private. Generation can take several minutes,
        sometimes longer than 5 minutes. You can leave and return to your
        creations.
      </Text>
    </Screen>
  );
}

export function PublishForm({
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

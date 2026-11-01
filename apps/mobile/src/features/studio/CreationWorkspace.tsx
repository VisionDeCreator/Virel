import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, useQuery, usePaginatedQuery, useStudio } from "@virel/api-client";
import { Button, Panel, SegmentedControl } from "@virel/ui-native";
import { colors } from "@virel/design-tokens";
import {
  creationFilters,
  generationInProgress,
  generationStatus,
  generationWaitMessage,
  elapsedTime,
  type CreationFilter,
} from "@virel/shared";
import { Screen, styles } from "../../components/Screen";
import { NativeStudioEditor, Preview, PublishForm } from "./NativeStudioEditor";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
type Studio = ReturnType<typeof useStudio>;
type Job = NonNullable<Studio["jobs"]>[number];
export function NativeCreationWorkspace() {
  const studio = useStudio({ draftStorage: AsyncStorage });
  const params = useLocalSearchParams<{
    job?: string;
    view?: string;
    source?: string;
  }>();
  const router = useRouter();
  const library = () => router.replace("/create");
  if (params.job)
    return (
      <NativeVideoDetails
        key={params.job}
        id={params.job}
        studio={studio}
        library={library}
        edit={(job) =>
          router.replace({
            pathname: "/create",
            params: { view: "new", retry: job._id },
          })
        }
        remix={(job) =>
          router.replace({
            pathname: "/create",
            params: { view: "new", asset: job.outputAssetId! },
          })
        }
      />
    );
  if (params.view === "new" || params.source)
    return (
      <View style={{ flex: 1 }}>
        <Button
          title="← Your creations"
          variant="secondary"
          onPress={library}
        />
        <NativeStudioEditor
          studio={studio}
          onGenerated={(id) =>
            router.replace({ pathname: "/create", params: { job: id } })
          }
        />
      </View>
    );
  return (
    <NativeLibrary
      studio={studio}
      create={() =>
        router.push({ pathname: "/create", params: { view: "new" } })
      }
      select={(id) => router.push({ pathname: "/create", params: { job: id } })}
    />
  );
}
function NativeLibrary({
  studio,
  create,
  select,
}: {
  studio: Studio;
  create: () => void;
  select: (id: string) => void;
}) {
  const [filter, setFilter] = useState<CreationFilter>("ready");
  const { results, status, loadMore } = usePaginatedQuery(
    api.generation.library,
    { filter },
    { initialNumItems: 12 },
  );
  const running = studio.jobs?.some((job) => generationInProgress(job.status));
  return (
    <FlatList<Job | null>
      data={[null, ...results]}
      numColumns={2}
      keyExtractor={(job) => job?._id ?? "create-new"}
      contentContainerStyle={{ padding: 22, gap: 20, paddingBottom: 40 }}
      columnWrapperStyle={{ gap: 12 }}
      initialNumToRender={8}
      windowSize={5}
      ListHeaderComponent={
        <View style={{ gap: 20 }}>
          <Text style={styles.heading}>Your creations</Text>
          <Link href="/settings" style={{ color: colors.primary }}>
            Settings
          </Link>
          <Text style={styles.text}>Every idea, all in one place.</Text>
          <Text style={styles.label}>
            {studio.balance
              ? `${studio.balance.available.toLocaleString()} credits available`
              : "Loading balance…"}
          </Text>
          {running && (
            <Panel>
              <Text style={styles.label}>Videos in progress</Text>
              <Text style={styles.text}>{generationWaitMessage}</Text>
              <Button
                title="View progress"
                variant="secondary"
                onPress={() => setFilter("progress")}
              />
            </Panel>
          )}
          <SegmentedControl
            label="Filter creations"
            options={creationFilters}
            value={filter}
            onChange={setFilter}
          />
        </View>
      }
      renderItem={({ item: job }) =>
        !job ? (
          <Pressable
            accessibilityRole="button"
            onPress={create}
            style={local.newCard}
          >
            <Text style={local.plus}>＋</Text>
            <Text style={local.newLabel}>Create a video</Text>
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${job.video?.title || job.input.prompt}, ${generationStatus(job.status)}`}
            onPress={() => select(job._id)}
            style={local.card}
          >
            <NativeCover job={job} studio={studio} />
            <Text numberOfLines={2} style={styles.label}>
              {job.video?.title || job.input.prompt || "Untitled video"}
            </Text>
            <Text style={local.small}>
              {job.input.duration}s · {job.input.aspectRatio} ·{" "}
              {job.input.resolution}
            </Text>
            <Text style={local.small}>
              {job.video?.status === "published" ? "Published" : "Private"} ·{" "}
              {new Date(job._creationTime).toLocaleDateString()}
            </Text>
          </Pressable>
        )
      }
      ListFooterComponent={
        <View style={{ gap: 20 }}>
          {status === "LoadingFirstPage" && (
            <Text accessibilityLiveRegion="polite" style={styles.text}>
              Loading your creations…
            </Text>
          )}
          {status !== "LoadingFirstPage" && !results.length && (
            <Panel>
              <Text style={styles.label}>
                {filter === "all"
                  ? "Your first idea starts here."
                  : "No videos in this view."}
              </Text>
              <Text style={styles.text}>
                {filter === "all"
                  ? "Create a video above. It stays private until you publish it."
                  : "Try another filter or start a new video."}
              </Text>
            </Panel>
          )}
          {status === "CanLoadMore" && (
            <Button
              title="Load more creations"
              variant="secondary"
              onPress={() => loadMore(12)}
            />
          )}
          {status === "LoadingMore" && (
            <ActivityIndicator color={colors.primary} />
          )}
        </View>
      }
    />
  );
}

function NativePoster({ url }: { url: string }) {
  const player = useVideoPlayer(url, (player) => {
    player.muted = true;
  });
  return (
    <View pointerEvents="none" style={{ width: "100%", aspectRatio: 3 / 4 }}>
      <VideoView
        player={player}
        nativeControls={false}
        contentFit="cover"
        style={{ width: "100%", height: "100%", borderRadius: 10 }}
      />
    </View>
  );
}
function NativeCover({ job, studio }: { job: Job; studio: Studio }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let live = true;
    if (job.outputAssetId)
      void studio
        .preview({ assetId: job.outputAssetId })
        .then((url) => {
          if (live) setUrl(url);
        })
        .catch(() => {});
    return () => {
      live = false;
    };
  }, [job.outputAssetId, studio.preview]);
  return (
    <View style={local.cover}>
      {url ? (
        <NativePoster url={url} />
      ) : (
        <Text style={local.plus}>
          {generationInProgress(job.status) ? "◌" : "▷"}
        </Text>
      )}
      <Text style={styles.label}>{generationStatus(job.status)}</Text>
    </View>
  );
}
function NativeVideoDetails({
  id,
  studio,
  library,
  remix,
  edit,
}: {
  id: string;
  studio: Studio;
  library: () => void;
  remix: (job: Job) => void;
  edit: (job: Job) => void;
}) {
  const job = useQuery(api.generation.detail, { jobId: id });
  const [now, setNow] = useState(Date.now());
  const [url, setUrl] = useState("");
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [publishing, setPublishing] = useState(false);
  const running = job && generationInProgress(job.status);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);
  useEffect(() => {
    let live = true;
    setUrl("");
    setError(false);
    function refresh() {
      if (job?.outputAssetId)
        void studio
          .preview({ assetId: job.outputAssetId })
          .then((url) => {
            if (live) {
              setUrl(url);
              setError(false);
            }
          })
          .catch(() => {
            if (live) setError(true);
          });
    }
    refresh();
    const timer = setInterval(refresh, 45 * 60000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [job?.outputAssetId, studio.preview, retry]);
  if (job === undefined)
    return (
      <Screen title="Your video">
        <Text style={styles.text}>Opening your video…</Text>
      </Screen>
    );
  if (!job)
    return (
      <Screen title="Video unavailable">
        <Text style={styles.text}>
          This video could not be found in your library.
        </Text>
        <Button title="Back to your creations" onPress={library} />
      </Screen>
    );
  return (
    <Screen
      title={
        running ? "Creating your video" : job.video?.title || "Video details"
      }
    >
      <Button title="← Your creations" variant="secondary" onPress={library} />
      <Text style={styles.label}>
        {job.video?.status === "published" ? "Published" : "Private"} ·{" "}
        {generationStatus(job.status)}
      </Text>
      {running ? (
        <Panel style={{ borderColor: colors.primary }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text accessibilityLiveRegion="polite" style={local.status}>
            {generationStatus(job.status)}
          </Text>
          <Text style={styles.text}>
            {job.status === "reconciliation_required"
              ? "We’re checking with the video provider. Check the status before starting another generation."
              : generationWaitMessage}
          </Text>
          <Text style={styles.label}>
            Elapsed {elapsedTime(job._creationTime, now)}
          </Text>
          <Text style={styles.text}>
            You can leave this screen and return to your creations. Generation
            continues in the background.
          </Text>
          {job.status === "reconciliation_required" && job.providerJobId && (
            <Button
              title="Check status"
              disabled={studio.busy}
              onPress={() =>
                void studio.run(() => studio.resume({ jobId: job._id }))
              }
            />
          )}
        </Panel>
      ) : job.status === "failed" ? (
        <Panel>
          <Text style={local.status}>We couldn’t create this video.</Text>
          <Text style={styles.text}>
            {job.financialState === "released" ||
            job.financialState === "refunded"
              ? "Your reserved credits were returned."
              : "Check credit activity for the status of your reserved credits."}
          </Text>
          <Button
            title="Edit and try again"
            disabled={studio.busy}
            onPress={() => edit(job)}
          />
        </Panel>
      ) : url ? (
        <Preview url={url} aspectRatio={job.input.aspectRatio} />
      ) : error ? (
        <Panel>
          <Text style={styles.text}>
            Preview unavailable. Retry without generating again.
          </Text>
          <Button
            title="Retry preview"
            onPress={() => setRetry((value) => value + 1)}
          />
        </Panel>
      ) : (
        <Text style={styles.text}>Loading your video…</Text>
      )}
      {job.status === "succeeded" && job.outputAssetId && (
        <>
          <Button
            title="Download / share video"
            disabled={studio.busy}
            onPress={() =>
              void studio.run(async () => {
                const signed = await studio.preview({
                  assetId: job.outputAssetId!,
                  download: true,
                });
                const downloaded = await FileSystem.downloadAsync(
                  signed,
                  `${FileSystem.cacheDirectory}virel-${job._id}.mp4`,
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
          <Button
            title="Remix"
            variant="secondary"
            disabled={studio.busy}
            onPress={() => remix(job)}
          />
          <Button
            title={
              publishing
                ? "Close publication settings"
                : job.video?.status === "published"
                  ? "Publication settings"
                  : "Publish…"
            }
            variant="secondary"
            disabled={job.financialState === "refunded"}
            onPress={() => setPublishing(!publishing)}
          />
          {publishing && job.financialState !== "refunded" && (
            <Panel>
              <PublishForm job={job} studio={studio} />
            </Panel>
          )}
        </>
      )}
      <Panel>
        <Text style={styles.label}>Prompt</Text>
        <Text style={styles.text}>{job.input.prompt}</Text>
        <Text style={styles.text}>
          {job.input.duration}s · {job.input.aspectRatio} ·{" "}
          {job.input.resolution}
        </Text>
        <Text style={styles.text}>
          {job.credits.toLocaleString()} credits{" "}
          {job.financialState === "released" ||
          job.financialState === "refunded"
            ? "returned"
            : job.financialState === "settled"
              ? "spent"
              : "reserved"}
        </Text>
        <Text style={styles.text}>
          Created {new Date(job._creationTime).toLocaleString()}
        </Text>
      </Panel>
      {!!studio.error && (
        <Text accessibilityRole="alert" style={styles.text}>
          {studio.error}
        </Text>
      )}
      {!!studio.message && (
        <Text accessibilityLiveRegion="polite" style={styles.text}>
          {studio.message}
        </Text>
      )}
    </Screen>
  );
}
const local = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  card: {
    flex: 1,
    maxWidth: "49%",
    padding: 10,
    gap: 8,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    backgroundColor: colors.surface,
  },
  newCard: {
    flex: 1,
    maxWidth: "49%",
    minHeight: 220,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.primary,
    borderRadius: 16,
  },
  cover: {
    minHeight: 140,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 10,
    backgroundColor: colors.elevated,
    gap: 10,
  },
  plus: { color: colors.primary, fontSize: 40 },
  newLabel: { color: colors.primary, fontWeight: "700", fontSize: 16 },
  small: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  status: { color: colors.text, fontSize: 24, fontWeight: "700" },
});

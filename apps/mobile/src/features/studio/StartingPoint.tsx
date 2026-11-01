import { useEffect, useState } from "react";
import { Modal, View, Text, FlatList } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useVideoPlayer, VideoView } from "expo-video";
import {
  api,
  useQuery,
  usePaginatedQuery,
  type useStudio,
  type Id,
} from "@virel/api-client";
import { Button, Panel, SegmentedControl } from "@virel/ui-native";
import { colors } from "@virel/design-tokens";
import { styles } from "../../components/Screen";
import type { PlatformBase } from "@virel/shared";
type Studio = ReturnType<typeof useStudio>;
export function NativeStartingPoint({ studio }: { studio: Studio }) {
  const { input } = studio;
  const base = useQuery(
    api.media.base,
    input.mode === "remix"
      ? { assetId: input.sourceAssetId, videoId: input.sourceVideoId }
      : "skip",
  );
  const [open, setOpen] = useState(false);
  return (
    <Panel>
      <Text style={styles.label}>Starting point</Text>
      {input.mode === "remix" ? (
        <>
          <Text style={{ ...styles.label, color: colors.primary }}>
            Remixing
          </Text>
          {base && <Poster base={base} studio={studio} />}
          <Text style={styles.label}>
            {base?.title ??
              (base === null
                ? "Base unavailable. Choose another platform video."
                : "Loading base…")}
          </Text>
          {base && (
            <Text style={styles.text}>
              @{base.creator} · {base.duration.toFixed(0)}s · {base.aspectRatio}
            </Text>
          )}
          <Text style={styles.text}>
            This video is your base. Motion and timing follow the original.
          </Text>
          <Button
            title="Change base"
            disabled={studio.busy}
            variant="secondary"
            onPress={() => setOpen(true)}
          />
          <Button
            title="Remove base"
            disabled={studio.busy}
            variant="secondary"
            onPress={() => void studio.selectBase(null)}
          />
        </>
      ) : (
        <>
          <Text style={styles.label}>New video</Text>
          <Text style={styles.text}>
            Start from your idea, or choose an existing Virel video as your
            base.
          </Text>
          <Button
            title="Choose a platform video"
            disabled={studio.busy}
            variant="secondary"
            onPress={() => setOpen(true)}
          />
        </>
      )}
      <Modal
        visible={open}
        onRequestClose={() => setOpen(false)}
        animationType="slide"
      >
        <SafeAreaView
          style={{
            flex: 1,
            backgroundColor: colors.background,
            padding: 22,
            gap: 16,
          }}
        >
          <Button
            title="Close"
            variant="secondary"
            onPress={() => setOpen(false)}
          />
          <Text style={styles.heading}>Choose a platform video</Text>
          <Text style={styles.text}>
            Uploads cannot be remix bases. Choose a generated video or a
            community video that allows remixes.
          </Text>
          {open && (
            <Picker
              studio={studio}
              select={async (base) => {
                if (await studio.selectBase(base)) setOpen(false);
              }}
            />
          )}
        </SafeAreaView>
      </Modal>
    </Panel>
  );
}
function Picker({
  studio,
  select,
}: {
  studio: Studio;
  select: (base: PlatformBase) => void;
}) {
  const [scope, setScope] = useState<"mine" | "community">("mine");
  const { results, status, loadMore } = usePaginatedQuery(
    api.media.bases,
    { scope },
    { initialNumItems: 12 },
  );
  return (
    <>
      <SegmentedControl
        label="Base video library"
        options={[
          { value: "mine", label: "My videos" },
          { value: "community", label: "Community" },
        ]}
        value={scope}
        onChange={setScope}
      />
      <FlatList
        data={results}
        keyExtractor={(base) => base.assetId}
        contentContainerStyle={{ gap: 16 }}
        renderItem={({ item: base }) => (
          <Panel>
            <Poster base={base} studio={studio} />
            <Text style={styles.label}>{base.title}</Text>
            <Text style={styles.text}>
              @{base.creator} · {base.duration.toFixed(0)}s · {base.aspectRatio}
            </Text>
            <Button
              title="Use as remix base"
              disabled={studio.busy}
              onPress={() => select(base)}
            />
          </Panel>
        )}
        ListEmptyComponent={
          <Text style={styles.text}>
            {status === "LoadingFirstPage"
              ? "Loading platform videos…"
              : "No eligible videos here yet. Create a video first, or check the community library."}
          </Text>
        }
        ListFooterComponent={
          status === "CanLoadMore" ? (
            <Button title="Load more videos" onPress={() => loadMore(12)} />
          ) : undefined
        }
      />
      {!!studio.error && (
        <Text accessibilityRole="alert" style={styles.text}>
          {studio.error}
        </Text>
      )}
    </>
  );
}
function Poster({ base, studio }: { base: PlatformBase; studio: Studio }) {
  const [url, setUrl] = useState(base.playbackUrl ?? "");
  useEffect(() => {
    let live = true;
    setUrl(base.playbackUrl ?? "");
    if (!base.playbackUrl)
      void studio
        .preview({ assetId: base.assetId as Id<"mediaAssets"> })
        .then((url) => {
          if (live) setUrl(url);
        })
        .catch(() => {});
    return () => {
      live = false;
    };
  }, [base.assetId, base.playbackUrl, studio.preview]);
  return url ? (
    <PosterVideo url={url} />
  ) : (
    <Text style={styles.text}>▷ Platform video</Text>
  );
}
function PosterVideo({ url }: { url: string }) {
  const player = useVideoPlayer(url, (player) => {
    player.muted = true;
  });
  return (
    <View pointerEvents="none" style={{ height: 150 }}>
      <VideoView
        player={player}
        nativeControls={false}
        contentFit="contain"
        style={{ width: "100%", height: "100%" }}
      />
    </View>
  );
}

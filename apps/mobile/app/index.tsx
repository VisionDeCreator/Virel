import { Text, View } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { api, usePaginatedQuery } from "@virel/api-client";
import { Button } from "@virel/ui-native";
import { Screen, styles } from "../src/components/Screen";
import { client } from "../src/lib/backend";
function Clip({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = true;
    p.muted = true;
  });
  return (
    <VideoView
      player={player}
      style={{ width: "100%", aspectRatio: 9 / 16 }}
      nativeControls
    />
  );
}
function Feed() {
  const { results, status, loadMore } = usePaginatedQuery(
    api.feed.list,
    {},
    { initialNumItems: 5 },
  );
  return (
    <Screen title="For you">
      {status === "LoadingFirstPage" ? (
        <Text style={styles.text}>Loading your feed…</Text>
      ) : !results.length ? (
        <Text style={styles.text}>
          No published videos yet. Your shared feed will appear here.
        </Text>
      ) : (
        results.map((video) => (
          <View key={video._id} style={{ gap: 12 }}>
            <Clip url={video.playbackUrl} />
            <Text style={styles.label}>
              @{video.creator?.username ?? "creator"} · {video.title}
            </Text>
          </View>
        ))
      )}
      {status === "CanLoadMore" && (
        <Button title="Load more" onPress={() => loadMore(5)} />
      )}
    </Screen>
  );
}
export default function Home() {
  return client ? (
    <Feed />
  ) : (
    <Screen title="Your next inspiration starts here.">
      <Text style={styles.text}>
        Set EXPO_PUBLIC_CONVEX_URL to connect your shared video feed. This is
        the Virel foundation.
      </Text>
    </Screen>
  );
}

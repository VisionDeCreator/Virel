import { Text, View, Image, AppState } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { api, usePaginatedQuery } from "@virel/api-client";
import { useEffect, useCallback } from "react";
import { useFocusEffect } from "expo-router";
import { Link } from "expo-router";
import { colors } from "@virel/design-tokens";
import { Button } from "@virel/ui-native";
import { Screen, styles } from "../src/components/Screen";
import { client } from "../src/lib/backend";
function Clip({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = true;
    p.muted = true;
  });
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
      style={{ width: "100%", aspectRatio: 9 / 16, borderRadius: 20 }}
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
    <Screen title="Find your next what if.">
      <Text style={styles.text}>
        A new creative current. Discover a moment that moves you.
      </Text>
      <Image
        source={require("../assets/desert-dancer.png")}
        style={{ width: "100%", height: 430, borderRadius: 20 }}
        accessibilityLabel="Concept artwork of a dancer in sunlit dunes"
      />
      <Text style={{ color: colors.primary, fontSize: 10, letterSpacing: 1 }}>
        STYLE STUDY · CONCEPT ARTWORK
      </Text>
      <Text style={[styles.heading, { fontSize: 26 }]}>
        Let the light lead.
      </Text>
      <Text style={styles.text}>
        Live videos and creator attribution appear when your community is
        connected.
      </Text>
      <Link
        href="/create"
        style={{ color: colors.primary, fontSize: 16, paddingVertical: 14 }}
      >
        Make something yours →
      </Link>
    </Screen>
  );
}

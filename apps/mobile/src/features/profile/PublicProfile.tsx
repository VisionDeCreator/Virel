import { useState } from "react";
import { Image, Text, View, Share } from "react-native";
import { Link } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import {
  api,
  useQuery,
  useMutation,
  usePaginatedQuery,
  useConvexAuth,
  useApiUrl,
} from "@virel/api-client";
import { Button, Panel } from "@virel/ui-native";
import { colors } from "@virel/design-tokens";
import { Screen, styles } from "../../components/Screen";
export function NativePublicProfile({ username }: { username: string }) {
  const profile = useQuery(api.profiles.publicProfile, { username });
  const { isAuthenticated } = useConvexAuth();
  const apiUrl = useApiUrl();
  const follow = useMutation(api.profiles.setFollowing);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  if (profile === undefined)
    return (
      <Screen title="Profile">
        <Text style={styles.text}>Loading profile…</Text>
      </Screen>
    );
  if (!profile)
    return (
      <Screen title="Profile not found">
        <Link href="/">Back to Home</Link>
      </Screen>
    );
  return (
    <Screen title={profile.displayName}>
      {profile.hasAvatar ? (
        <Image
          source={{
            uri: `${apiUrl}/avatars/${username}?v=${profile.avatarVersion}`,
          }}
          style={{ width: 100, height: 100, borderRadius: 50 }}
          accessibilityLabel={`${profile.displayName}’s profile picture`}
        />
      ) : (
        <View
          style={{
            width: 100,
            height: 100,
            borderRadius: 50,
            backgroundColor: colors.elevated,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={styles.heading}>{profile.displayName.slice(0, 1)}</Text>
        </View>
      )}
      <Text style={styles.label}>@{profile.username}</Text>
      <Text style={styles.text}>{profile.bio}</Text>
      <Text style={styles.text}>
        {profile.followers} followers · {profile.following} following
      </Text>
      {profile.isOwner ? (
        <Link
          href={{ pathname: "/settings", params: { tab: "account" } }}
          style={{ color: colors.primary }}
        >
          Edit profile →
        </Link>
      ) : isAuthenticated ? (
        <Button
          title={profile.isFollowing ? "Following · Unfollow" : "Follow"}
          disabled={busy}
          onPress={() => {
            setBusy(true);
            void follow({ username, following: !profile.isFollowing })
              .catch(() =>
                setMessage(
                  "Unable to follow. Check that your profile is set up and try again.",
                ),
              )
              .finally(() => setBusy(false));
          }}
        />
      ) : (
        <Link href="/profile">Sign in to follow</Link>
      )}
      <Button
        title="Share profile"
        variant="secondary"
        onPress={() =>
          void Share.share({
            message: `Check out @${username} on Virel`,
          }).catch(() => setMessage("Unable to share profile."))
        }
      />
      {!!message && (
        <Text accessibilityLiveRegion="polite" style={styles.text}>
          {message}
        </Text>
      )}
      <Text accessibilityRole="header" style={styles.label}>
        Published videos
      </Text>
      <Videos username={username} />
    </Screen>
  );
}
function Videos({ username }: { username: string }) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.profiles.videos,
    { username },
    { initialNumItems: 6 },
  );
  return (
    <>
      {results.map((video) => (
        <Panel key={video._id}>
          <Clip url={video.playbackUrl} />
          <Text style={styles.label}>{video.title}</Text>
          {video.remixEnabled && (
            <Link
              href={{ pathname: "/create", params: { source: video._id } }}
              style={{ color: colors.primary }}
            >
              Remix this video →
            </Link>
          )}
        </Panel>
      ))}
      {!results.length && (
        <Text style={styles.text}>
          {status === "LoadingFirstPage"
            ? "Loading videos…"
            : "No published videos yet."}
        </Text>
      )}
      {status === "CanLoadMore" && (
        <Button title="Load more videos" onPress={() => loadMore(6)} />
      )}
    </>
  );
}
function Clip({ url }: { url: string }) {
  const player = useVideoPlayer(url);
  return (
    <VideoView
      player={player}
      nativeControls
      style={{ width: "100%", aspectRatio: 9 / 16, borderRadius: 12 }}
    />
  );
}

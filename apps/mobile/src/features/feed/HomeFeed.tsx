import { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  FlatList,
  View,
  Text,
  Pressable,
  Modal,
  TextInput,
  Share,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useFocusEffect, Link, useLocalSearchParams } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import {
  api,
  usePaginatedQuery,
  useQuery,
  useMutation,
  useConvexAuth,
  usePostReaction,
  type Id,
  type FunctionReturnType,
} from "@virel/api-client";
import * as Linking from "expo-linking";
import { colors } from "@virel/design-tokens";
import { Button } from "@virel/ui-native";
import { styles } from "../../components/Screen";

type Post = FunctionReturnType<typeof api.feed.list>["page"][number];
type Session = FunctionReturnType<typeof api.feed.preferences> & {
  startedAt: number;
};
type Mode = "for-you" | "following" | "saved";
function Action({
  title,
  onPress,
  selected,
  disabled,
}: {
  title: string;
  onPress: () => void;
  selected?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{ padding: 10, minHeight: 44, opacity: disabled ? 0.5 : 1 }}
    >
      <Text style={{ color: selected ? colors.primary : colors.text }}>
        {title}
      </Text>
    </Pressable>
  );
}
function Clip({
  post,
  active,
  muted,
  height,
}: {
  post: Post;
  active: boolean;
  muted: boolean;
  height: number;
}) {
  const watch = useMutation(api.feed.watch);
  const deliberate = useRef(false);
  const watched = useRef(0);
  const reported = useRef(0);
  const player = useVideoPlayer(post.playbackUrl, (p) => {
    p.loop = true;
    p.muted = muted;
    p.timeUpdateEventInterval = 0.25;
  });
  const [error, setError] = useState(false);
  useEffect(() => {
    player.muted = muted;
  }, [muted, player]);
  useEffect(() => {
    let last: number | null = null;
    const play = () => {
      if (active && AppState.currentState === "active") player.play();
      else player.pause();
    };
    const flush = () => {
      if (watched.current > reported.current && player.duration > 0) {
        void watch({
          videoId: post._id,
          completion: Math.min(1, watched.current / player.duration),
          deliberate: deliberate.current,
        }).catch(() => {});
        reported.current = watched.current;
      }
    };
    play();
    const time = player.addListener("timeUpdate", ({ currentTime }) => {
      if (active && player.playing && AppState.currentState === "active") {
        if (last !== null) {
          const delta = currentTime - last;
          if (delta > 0 && delta < 1.5) watched.current += delta;
        }
        last = currentTime;
      } else last = null;
    });
    const state = AppState.addEventListener("change", () => {
      play();
      last = null;
      if (AppState.currentState !== "active") flush();
    });
    const status = player.addListener("statusChange", ({ status }) =>
      setError(status === "error"),
    );
    return () => {
      flush();
      player.pause();
      time.remove();
      state.remove();
      status.remove();
    };
  }, [active, player, post._id, watch]);
  return (
    <View
      style={{ height, backgroundColor: "#000" }}
      onTouchStart={() => {
        deliberate.current = true;
      }}
    >
      {error ? (
        <View style={{ padding: 24 }}>
          <Text style={styles.text}>Video unavailable.</Text>
          <Button
            title="Retry playback"
            onPress={() => {
              setError(false);
              void player
                .replaceAsync(post.playbackUrl)
                .catch(() => setError(true));
            }}
          />
        </View>
      ) : (
        <VideoView
          player={player}
          style={{ width: "100%", height: "100%" }}
          contentFit="contain"
          nativeControls
        />
      )}
    </View>
  );
}
export function HomeFeed() {
  const preferences = useQuery(api.feed.preferences);
  const { isAuthenticated } = useConvexAuth();
  const [session, setSession] = useState<Session | null>(null);
  const [mode, setMode] = useState<Mode>("for-you");
  const [active, setActive] = useState<string | null>(null);
  const [focused, setFocused] = useState(true);
  const [height, setHeight] = useState(700);
  const [muted, setMuted] = useState(true);
  const [comments, setComments] = useState<Post | null>(null);
  const [more, setMore] = useState<Post | null>(null);
  const [busy, setBusy] = useState(false);
  const list = useRef<FlatList<Post>>(null);
  const params = useLocalSearchParams<{ post?: string }>();
  const linked = useQuery(
    api.feed.post,
    params.post ? { videoId: params.post } : "skip",
  );
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  useEffect(() => {
    setSession(null);
  }, [isAuthenticated]);
  useEffect(() => {
    if (!session && preferences)
      setSession({ ...preferences, startedAt: Date.now() });
  }, [preferences, session]);
  const { results, status, loadMore } = usePaginatedQuery(
    api.feed.list,
    session ? { mode, session } : "skip",
    { initialNumItems: 12 },
  );
  const posts = linked
    ? [linked, ...results.filter((p) => p._id !== linked._id)]
    : results;
  const reaction = usePostReaction();
  const following = useMutation(api.profiles.setFollowing);
  const hide = useMutation(api.feed.hide);
  const report = useMutation(api.feed.report);
  const [reason, setReason] = useState("");
  const viewability = useRef(
    ({ viewableItems }: { viewableItems: { item: Post }[] }) => {
      if (viewableItems[0]) setActive(viewableItems[0].item._id);
    },
  ).current;
  const viewConfig = useRef({ itemVisiblePercentThreshold: 70 }).current;
  const refresh = (next = mode) => {
    setSession({
      ...(preferences ?? { affinities: [], seen: [] }),
      startedAt: Date.now(),
    });
    setMode(next);
    list.current?.scrollToOffset({ offset: 0 });
  };
  async function run(fn: () => Promise<unknown>) {
    if (!isAuthenticated) {
      Alert.alert(
        "Sign in",
        "Open your profile to sign in and interact with posts.",
      );
      return;
    }
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      Alert.alert(
        "Please try again",
        e instanceof Error ? e.message : "Something went wrong.",
      );
    } finally {
      setBusy(false);
    }
  }
  // Filtered pages may be empty; continue scanning until matching posts or the end.
  useEffect(() => {
    if (!results.length && status === "CanLoadMore") loadMore(12);
  }, [results.length, status, loadMore]);
  return (
    <View
      style={{ flex: 1 }}
      onLayout={(e) =>
        setHeight(Math.max(400, e.nativeEvent.layout.height - 52))
      }
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-around",
          height: 52,
        }}
      >
        {(
          [
            ["for-you", "For You"],
            ["following", "Following"],
            ["saved", "Saved"],
          ] as const
        ).map(([value, title]) => (
          <Action
            key={value}
            title={title}
            selected={value === mode}
            onPress={() => refresh(value)}
          />
        ))}
      </View>
      <FlatList
        ref={list}
        data={posts}
        keyExtractor={(p) => p._id}
        pagingEnabled
        snapToInterval={height}
        decelerationRate="fast"
        onViewableItemsChanged={viewability}
        viewabilityConfig={viewConfig}
        windowSize={3}
        initialNumToRender={2}
        maxToRenderPerBatch={3}
        onEndReached={() => {
          if (status === "CanLoadMore") loadMore(12);
        }}
        onEndReachedThreshold={2}
        refreshing={status === "LoadingFirstPage"}
        onRefresh={() => refresh()}
        getItemLayout={(_, index) => ({
          length: height,
          offset: height * index,
          index,
        })}
        ListEmptyComponent={
          <View style={{ padding: 24, gap: 16 }}>
            {status === "LoadingFirstPage" ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text style={styles.text}>
                {mode === "saved"
                  ? "Bookmark videos to keep your inspiration here."
                  : mode === "following"
                    ? "Follow creators to see their videos here."
                    : "The first wave starts with you. No videos yet."}
              </Text>
            )}
            {mode !== "for-you" && !isAuthenticated && (
              <Link href="/profile" style={{ color: colors.primary }}>
                Sign in from your profile
              </Link>
            )}
          </View>
        }
        ListFooterComponent={
          <View style={{ padding: 20 }}>
            {status === "LoadingMore" ? (
              <ActivityIndicator color={colors.primary} />
            ) : status === "Exhausted" && posts.length > 0 ? (
              <Button
                title="You’re caught up · Refresh"
                onPress={() => refresh()}
              />
            ) : null}
          </View>
        }
        renderItem={({ item: post }) => (
          <View style={{ height, backgroundColor: colors.background }}>
            <Clip
              post={post}
              height={height - 260}
              active={focused && !comments && !more && active === post._id}
              muted={muted}
            />
            <View style={{ padding: 12, gap: 6, height: 260 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Link
                  href={{
                    pathname: "/u/[username]",
                    params: { username: post.creator?.username ?? "creator" },
                  }}
                  style={{ color: colors.text }}
                >
                  @{post.creator?.username ?? "creator"}
                </Link>
                {post.creator && !post.isOwner && (
                  <Action
                    title={post.isFollowing ? "Following" : "Follow"}
                    disabled={busy}
                    onPress={() =>
                      void run(() =>
                        following({
                          username: post.creator!.username,
                          following: !post.isFollowing,
                        }),
                      )
                    }
                  />
                )}
              </View>
              <Text style={styles.label} numberOfLines={1}>
                {post.title}
              </Text>
              <Text style={styles.text} numberOfLines={1}>
                {post.description}
              </Text>
              {post.rootCreator && (
                <Text style={styles.text} numberOfLines={1}>
                  Original by @{post.rootCreator.username}
                  {post.parentCreator &&
                  post.parentCreator._id !== post.rootCreator._id
                    ? ` · From @${post.parentCreator.username}`
                    : ""}
                </Text>
              )}
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <Action
                  title={`♥ ${post.likeCount}`}
                  selected={post.liked}
                  disabled={busy}
                  onPress={() =>
                    void run(() =>
                      reaction({
                        videoId: post._id,
                        kind: "like",
                        active: !post.liked,
                      }),
                    )
                  }
                />
                <Action
                  title={`Comments ${post.commentCount}`}
                  onPress={() => setComments(post)}
                />
                <Action
                  title={post.bookmarked ? "Saved" : "Save"}
                  selected={post.bookmarked}
                  disabled={busy}
                  onPress={() =>
                    void run(() =>
                      reaction({
                        videoId: post._id,
                        kind: "bookmark",
                        active: !post.bookmarked,
                      }),
                    )
                  }
                />
                {post.remixEnabled && (
                  <Link
                    href={{ pathname: "/create", params: { source: post._id } }}
                    style={{ color: colors.primary, padding: 10 }}
                  >
                    Remix
                  </Link>
                )}
                <Action
                  title="Share"
                  onPress={() => {
                    void Share.share({
                      message: process.env.EXPO_PUBLIC_WEB_URL
                        ? `${process.env.EXPO_PUBLIC_WEB_URL}/?post=${post._id}`
                        : Linking.createURL("/", {
                            queryParams: { post: post._id },
                          }),
                    }).catch(() =>
                      Alert.alert("Unable to share", "Please try again."),
                    );
                  }}
                />
                <Action
                  title={muted ? "Sound on" : "Mute"}
                  onPress={() => setMuted(!muted)}
                />
                <Action
                  title="More"
                  onPress={() => {
                    setReason("");
                    setMore(post);
                  }}
                />
              </View>
            </View>
          </View>
        )}
      />
      {comments && (
        <Comments post={comments} onClose={() => setComments(null)} />
      )}
      <Modal
        visible={Boolean(more)}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setMore(null)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: colors.background,
            padding: 24,
            gap: 16,
          }}
        >
          <Button title="Close" onPress={() => setMore(null)} />
          <Text style={styles.heading}>Post options</Text>
          <Button
            title="Not interested"
            disabled={busy}
            onPress={() =>
              more &&
              void run(async () => {
                await reaction({
                  videoId: more._id,
                  kind: "dismiss",
                  active: true,
                });
                setMore(null);
              })
            }
          />
          <TextInput
            accessibilityLabel="Reason for reporting"
            placeholder="Reason for reporting"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={reason}
            onChangeText={setReason}
            maxLength={1000}
            multiline
          />
          <Button
            title="Report post"
            disabled={busy || !reason.trim()}
            onPress={() =>
              more &&
              void run(async () => {
                await report({ videoId: more._id, reason });
                setMore(null);
                Alert.alert(
                  "Report received",
                  "Thank you for letting us know.",
                );
              })
            }
          />
          {more?.isOwner && (
            <Button
              title="Hide my post"
              disabled={busy}
              onPress={() =>
                void run(async () => {
                  await hide({ videoId: more._id });
                  setMore(null);
                })
              }
            />
          )}
        </View>
      </Modal>
    </View>
  );
}
function Comments({ post, onClose }: { post: Post; onClose: () => void }) {
  const { isAuthenticated } = useConvexAuth();
  const { results, status, loadMore } = usePaginatedQuery(
    api.feed.comments,
    { videoId: post._id },
    { initialNumItems: 20 },
  );
  const add = useMutation(api.feed.addComment);
  const remove = useMutation(api.feed.deleteComment);
  const [body, setBody] = useState("");
  const [parentId, setParentId] = useState<Id<"postComments"> | undefined>();
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      Alert.alert(
        "Please try again",
        e instanceof Error ? e.message : "Something went wrong.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{
          flex: 1,
          padding: 24,
          gap: 16,
          backgroundColor: colors.background,
        }}
      >
        <Button title="Close comments" onPress={onClose} />
        <Text style={styles.heading}>Comments</Text>
        <FlatList
          data={results}
          keyExtractor={(c) => c._id}
          keyboardShouldPersistTaps="handled"
          onEndReached={() => {
            if (status === "CanLoadMore") loadMore(20);
          }}
          ListEmptyComponent={
            <Text style={styles.text}>
              {status === "LoadingFirstPage"
                ? "Loading comments…"
                : "Start the conversation."}
            </Text>
          }
          renderItem={({ item: c }) => (
            <View
              style={{
                paddingVertical: 12,
                paddingLeft: c.parentId ? 20 : 0,
                borderBottomWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text style={styles.label}>
                @{c.creator?.username ?? "creator"}
                {c.parentId
                  ? ` · Reply to @${results.find((p) => p._id === c.parentId)?.creator?.username ?? "a comment"}`
                  : ""}
              </Text>
              <Text style={styles.text}>{c.body}</Text>
              {!c.deleted && (
                <View style={{ flexDirection: "row" }}>
                  {isAuthenticated && (
                    <Action title="Reply" onPress={() => setParentId(c._id)} />
                  )}{" "}
                  {c.isOwner && (
                    <Action
                      title="Delete"
                      disabled={busy}
                      onPress={() =>
                        void run(() => remove({ commentId: c._id }))
                      }
                    />
                  )}
                </View>
              )}
            </View>
          )}
        />
        {isAuthenticated ? (
          <View style={{ gap: 10 }}>
            {parentId && (
              <Action
                title="Cancel reply"
                onPress={() => setParentId(undefined)}
              />
            )}
            <TextInput
              accessibilityLabel="Your comment"
              style={styles.input}
              placeholder="Add a comment…"
              placeholderTextColor={colors.muted}
              value={body}
              onChangeText={setBody}
              maxLength={2000}
              multiline
            />
            <Button
              title="Post comment"
              disabled={busy || !body.trim()}
              onPress={() =>
                void run(async () => {
                  await add({ videoId: post._id, body, parentId });
                  setBody("");
                  setParentId(undefined);
                })
              }
            />
          </View>
        ) : (
          <Text style={styles.text}>Sign in from your profile to comment.</Text>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

import { useEffect, useRef, useState } from "react";
import { NavLink, useSearchParams } from "react-router-dom";
import {
  Volume2,
  VolumeX,
  ArrowUpRight,
  Heart,
  MessageCircle,
  Bookmark,
  Share2,
  Repeat2,
  MoreHorizontal,
  X,
} from "lucide-react";
import {
  api,
  usePaginatedQuery,
  useMutation,
  useQuery,
  useConvexAuth,
  usePostReaction,
  type Id,
} from "@virel/api-client";
import type { FunctionReturnType } from "convex/server";
import { Button, EmptyState } from "@virel/ui";

type Mode = "for-you" | "following" | "saved";
type Post = FunctionReturnType<typeof api.feed.list>["page"][number];
type Preferences = FunctionReturnType<typeof api.feed.preferences>;
type Session = Preferences & { startedAt: number };
function Video({
  post,
  muted,
  active,
  onActive,
}: {
  post: Post;
  muted: boolean;
  active: boolean;
  onActive: (visible: boolean) => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const deliberate = useRef(false);
  const watched = useRef(0);
  const reported = useRef(0);
  const lastTime = useRef<number | null>(null);
  const onActiveRef = useRef(onActive);
  onActiveRef.current = onActive;
  const watch = useMutation(api.feed.watch);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const container = frame.current;
    if (!container) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        onActiveRef.current(entry.isIntersecting);
      },
      { threshold: 0.7 },
    );
    observer.observe(container);
    const preload = new IntersectionObserver(
      ([entry]) => setNear(entry.isIntersecting),
      { rootMargin: "100%" },
    );
    preload.observe(container);
    return () => {
      observer.disconnect();
      preload.disconnect();
    };
  }, []);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const play = () => {
      if (active && !document.hidden) void video.play().catch(() => {});
      else {
        video.pause();
        lastTime.current = null;
      }
    };
    const flush = () => {
      if (
        watched.current > reported.current &&
        Number.isFinite(video.duration) &&
        video.duration > 0
      ) {
        void watch({
          videoId: post._id,
          completion: Math.min(1, watched.current / video.duration),
          deliberate: deliberate.current,
        }).catch(() => {});
        reported.current = watched.current;
      }
    };
    const visibility = () => {
      play();
      if (document.hidden) flush();
    };
    play();
    document.addEventListener("visibilitychange", visibility);
    return () => {
      video.pause();
      flush();
      lastTime.current = null;
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [active, near, failed, post._id, watch]);
  return (
    <div ref={frame} className="feed-video-frame">
      {failed ? (
        <div className="creation-empty" role="alert">
          <p>Video unavailable.</p>
          <Button onClick={() => setFailed(false)}>Retry playback</Button>
        </div>
      ) : near ? (
        <video
          ref={ref}
          src={post.playbackUrl}
          controls
          playsInline
          muted={muted}
          loop
          preload={active ? "auto" : "metadata"}
          onPointerDown={() => {
            deliberate.current = true;
          }}
          onKeyDown={() => {
            deliberate.current = true;
          }}
          onPlay={() => {
            if (!active) {
              ref.current?.pause();
              onActiveRef.current(true);
            }
          }}
          onTimeUpdate={() => {
            const video = ref.current;
            if (!video || !active || video.paused || document.hidden) {
              lastTime.current = null;
              return;
            }
            const now = video.currentTime;
            if (lastTime.current !== null) {
              const delta = now - lastTime.current;
              if (delta > 0 && delta < 1.5) watched.current += delta;
            }
            lastTime.current = now;
          }}
          onError={() => setFailed(true)}
        />
      ) : null}
    </div>
  );
}
export function Feed() {
  const preferences = useQuery(api.feed.preferences);
  const { isAuthenticated } = useConvexAuth();
  const [params, setParams] = useSearchParams();
  const initialMode = params.get("feed");
  const [mode, setMode] = useState<Mode>(
    initialMode === "following" || initialMode === "saved"
      ? initialMode
      : "for-you",
  );
  const [session, setSession] = useState<Session | null>(() => {
    try {
      const saved = JSON.parse(
        sessionStorage.getItem("virel.feed.session") ?? "null",
      );
      return saved && Date.now() - saved.startedAt < 3600000 ? saved : null;
    } catch {
      return null;
    }
  });
  const [muted, setMuted] = useState(true);
  const [active, setActive] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [comments, setComments] = useState<Post | null>(null);
  const [more, setMore] = useState<Post | null>(null);
  const restored = useRef(false);
  const storedPosition = useRef(
    sessionStorage.getItem(`virel.feed.position.${mode}`),
  );
  const sentinel = useRef<HTMLDivElement>(null);
  const account = useRef(isAuthenticated);
  useEffect(() => {
    if (account.current !== isAuthenticated) {
      account.current = isAuthenticated;
      setSession(null);
      restored.current = true;
    }
  }, [isAuthenticated]);
  useEffect(() => {
    if (!session && preferences) {
      const next = { ...preferences, startedAt: Date.now() };
      setSession(next);
      sessionStorage.setItem("virel.feed.session", JSON.stringify(next));
    }
  }, [preferences, session]);
  const { results, status, loadMore } = usePaginatedQuery(
    api.feed.list,
    session ? { mode, session } : "skip",
    { initialNumItems: 12 },
  );
  const focused = useQuery(
    api.feed.post,
    params.get("post") ? { videoId: params.get("post")! } : "skip",
  );
  const posts = focused
    ? [focused, ...results.filter((v) => v._id !== focused._id)]
    : results;
  const reaction = usePostReaction();
  const following = useMutation(api.profiles.setFollowing);
  const hide = useMutation(api.feed.hide);
  const report = useMutation(api.feed.report);
  const [busy, setBusy] = useState<string | null>(null);
  async function run(key: string, action: () => Promise<unknown>) {
    if (!isAuthenticated) {
      setMessage("Sign in from your profile to interact with posts.");
      return;
    }
    setBusy(key);
    setMessage("");
    try {
      await action();
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(null);
    }
  }
  useEffect(() => {
    const target = sentinel.current;
    if (!target || status !== "CanLoadMore") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) loadMore(12);
      },
      { rootMargin: "800px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [status, loadMore, results.length]);
  useEffect(() => {
    if (restored.current || status === "LoadingFirstPage") return;
    const id = storedPosition.current;
    if (!id || focused) {
      restored.current = true;
      return;
    }
    const element = document.getElementById(`post-${id}`);
    if (element) {
      element.scrollIntoView({ block: "center" });
      restored.current = true;
    } else if (status === "CanLoadMore") loadMore(12);
    else if (status === "Exhausted") restored.current = true;
  }, [results, status, loadMore, mode, focused]);
  function refresh(nextMode = mode) {
    const next = {
      ...(preferences ?? { affinities: [], seen: [] }),
      startedAt: Date.now(),
    };
    setSession(next);
    sessionStorage.setItem("virel.feed.session", JSON.stringify(next));
    setMode(nextMode);
    restored.current = true;
    setActive(null);
    setParams(nextMode === "for-you" ? {} : { feed: nextMode });
    window.scrollTo(0, 0);
  }
  async function share(post: Post) {
    const url = new URL("/", window.location.origin);
    url.searchParams.set("post", post._id);
    try {
      if (navigator.share)
        await navigator.share({ title: post.title, url: url.href });
      else {
        await navigator.clipboard.writeText(url.href);
        setMessage("Post link copied.");
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError"))
        setMessage("Unable to share this post. Please try again.");
    }
  }
  return (
    <div className="feed-page live-feed">
      <div className="feed-toolbar">
        <div role="group" aria-label="Choose feed">
          {(
            [
              ["for-you", "For You"],
              ["following", "Following"],
              ["saved", "Saved"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              aria-pressed={mode === value}
              onClick={() => refresh(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <Button onClick={() => refresh()}>Refresh</Button>
      </div>
      <p className="feed-message" role="status">
        {message}
      </p>
      {params.has("post") && focused === null && (
        <p role="status">This post is unavailable.</p>
      )}
      {(mode === "following" || mode === "saved") && !isAuthenticated && (
        <p>
          <NavLink to="/profile">Sign in</NavLink> to see{" "}
          {mode === "saved" ? "your saved posts" : "creators you follow"}.
        </p>
      )}
      {status === "LoadingFirstPage" && (
        <p role="status">Finding your next inspiration…</p>
      )}
      <div className="feed-column">
        {posts.map((post) => (
          <article
            className="feed-card live-post"
            key={post._id}
            id={`post-${post._id}`}
          >
            <Video
              post={post}
              muted={muted}
              active={!comments && !more && active === post._id}
              onActive={(visible) => {
                setActive((current) =>
                  visible ? post._id : current === post._id ? null : current,
                );
                if (visible)
                  sessionStorage.setItem(
                    `virel.feed.position.${mode}`,
                    post._id,
                  );
              }}
            />
            <div className="feed-caption">
              <div className="post-creator">
                <NavLink to={`/u/${post.creator?.username ?? "creator"}`}>
                  @{post.creator?.username ?? "creator"}
                </NavLink>
                {!post.isOwner && post.creator && (
                  <button
                    disabled={busy !== null}
                    onClick={() =>
                      run(post._id, () =>
                        following({
                          username: post.creator!.username,
                          following: !post.isFollowing,
                        }),
                      )
                    }
                  >
                    {post.isFollowing ? "Following" : "Follow"}
                  </button>
                )}
              </div>
              <h2>{post.title}</h2>
              <p>{post.description}</p>
              {post.rootCreator && (
                <p>
                  Original by{" "}
                  <NavLink to={`/u/${post.rootCreator.username}`}>
                    @{post.rootCreator.username}
                  </NavLink>
                  {post.parentCreator &&
                  post.parentCreator._id !== post.rootCreator._id
                    ? ` · Remixed from @${post.parentCreator.username}`
                    : ""}
                </p>
              )}
              <div className="post-actions">
                <button
                  aria-label="Like"
                  aria-pressed={post.liked}
                  disabled={busy !== null}
                  onClick={() =>
                    run(post._id, () =>
                      reaction({
                        videoId: post._id,
                        kind: "like",
                        active: !post.liked,
                      }),
                    )
                  }
                >
                  <Heart
                    fill={post.liked ? "currentColor" : "none"}
                    size={22}
                  />
                  <span>{post.likeCount}</span>
                </button>
                <button aria-label="Comments" onClick={() => setComments(post)}>
                  <MessageCircle size={22} />
                  <span>{post.commentCount}</span>
                </button>
                <button
                  aria-label="Bookmark"
                  aria-pressed={post.bookmarked}
                  disabled={busy !== null}
                  onClick={() =>
                    run(post._id, () =>
                      reaction({
                        videoId: post._id,
                        kind: "bookmark",
                        active: !post.bookmarked,
                      }),
                    )
                  }
                >
                  <Bookmark
                    fill={post.bookmarked ? "currentColor" : "none"}
                    size={22}
                  />
                  <span>Save</span>
                </button>
                {post.remixEnabled && (
                  <NavLink to={`/create?source=${post._id}`}>
                    <Repeat2 size={22} />
                    <span>Remix</span>
                  </NavLink>
                )}
                <button aria-label="Share" onClick={() => void share(post)}>
                  <Share2 size={22} />
                  <span>Share</span>
                </button>
                <button
                  aria-label={muted ? "Enable sound" : "Mute videos"}
                  onClick={() => setMuted(!muted)}
                >
                  {muted ? <VolumeX size={22} /> : <Volume2 size={22} />}
                </button>
                <button aria-label="More options" onClick={() => setMore(post)}>
                  <MoreHorizontal size={22} />
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
      <div ref={sentinel} className="feed-sentinel" />
      {status === "LoadingMore" && <p role="status">Loading more videos…</p>}
      {status === "CanLoadMore" && (
        <Button onClick={() => loadMore(12)}>Load more</Button>
      )}
      {status === "Exhausted" && (
        <EmptyState
          title={
            posts.length
              ? "You’re all caught up."
              : mode === "saved"
                ? "Keep your inspiration here."
                : mode === "following"
                  ? "Your creative circle starts here."
                  : "The first wave starts with you."
          }
        >
          {mode === "saved"
            ? "Bookmark a post to find it here."
            : mode === "following"
              ? "Follow creators to see their published videos here."
              : "Fresh videos will appear as your community creates."}
          <Button onClick={() => refresh()}>Check for new videos</Button>
        </EmptyState>
      )}
      {comments && (
        <Comments post={comments} onClose={() => setComments(null)} />
      )}
      {more && (
        <PostDialog title="Post options" onClose={() => setMore(null)}>
          <div className="post-menu">
            <Button
              disabled={busy !== null}
              onClick={() =>
                void run(more._id, async () => {
                  await reaction({
                    videoId: more._id,
                    kind: "dismiss",
                    active: true,
                  });
                  setMore(null);
                })
              }
            >
              Not interested
            </Button>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                void run(more._id, async () => {
                  await report({
                    videoId: more._id,
                    reason: String(data.get("reason")),
                  });
                  setMore(null);
                  setMessage("Report received. Thank you.");
                });
              }}
            >
              <label>
                Reason for reporting
                <textarea name="reason" required maxLength={1000} />
              </label>
              <Button type="submit" disabled={busy !== null}>
                Report post
              </Button>
            </form>
            {more.isOwner && (
              <Button
                disabled={busy !== null}
                onClick={() =>
                  void run(more._id, async () => {
                    await hide({ videoId: more._id });
                    setMore(null);
                  })
                }
              >
                Hide my post
              </Button>
            )}
            {message && <p role="alert">{message}</p>}
          </div>
        </PostDialog>
      )}
    </div>
  );
}
function PostDialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      className="post-dialog"
      ref={ref}
      aria-label={title}
      onCancel={onClose}
    >
      <div className="dialog-heading">
        <h2>{title}</h2>
        <button aria-label="Close" onClick={onClose}>
          <X />
        </button>
      </div>
      {children}
    </dialog>
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
  const [reply, setReply] = useState<{
    id: Id<"postComments">;
    username: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <PostDialog title="Comments" onClose={onClose}>
      <div className="comment-list">
        {results.map((c) => (
          <article
            className={c.parentId ? "post-comment reply" : "post-comment"}
            key={c._id}
          >
            <NavLink to={`/u/${c.creator?.username ?? "creator"}`}>
              @{c.creator?.username ?? "creator"}
            </NavLink>
            {c.parentId && (
              <small>
                Reply to @
                {results.find((p) => p._id === c.parentId)?.creator?.username ??
                  "a comment"}
              </small>
            )}
            <p>{c.body}</p>
            {!c.deleted && (
              <div>
                {isAuthenticated && (
                  <button
                    onClick={() =>
                      setReply({
                        id: c._id,
                        username: c.creator?.username ?? "creator",
                      })
                    }
                  >
                    Reply
                  </button>
                )}
                {c.isOwner && (
                  <button
                    disabled={busy}
                    onClick={() => void act(() => remove({ commentId: c._id }))}
                  >
                    Delete
                  </button>
                )}
              </div>
            )}
          </article>
        ))}
        {status === "LoadingFirstPage" && (
          <p role="status">Loading comments…</p>
        )}
        {status === "Exhausted" && !results.length && (
          <p>Start the conversation.</p>
        )}
        {status === "CanLoadMore" && (
          <Button onClick={() => loadMore(20)}>More comments</Button>
        )}
      </div>
      {isAuthenticated ? (
        <form
          className="comment-form"
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () => {
              await add({ videoId: post._id, body, parentId: reply?.id });
              setBody("");
              setReply(null);
            });
          }}
        >
          {reply && (
            <p>
              Replying to @{reply.username}{" "}
              <button type="button" onClick={() => setReply(null)}>
                Cancel reply
              </button>
            </p>
          )}
          <label htmlFor="comment-body">Your comment</label>
          <textarea
            id="comment-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={2000}
            required
            placeholder="Add to the conversation…"
          />
          <Button type="submit" disabled={busy || !body.trim()}>
            Post comment
          </Button>
        </form>
      ) : (
        <NavLink to="/profile">Sign in to comment</NavLink>
      )}
      {error && <p role="alert">{error}</p>}
    </PostDialog>
  );
}
function FeedHeading() {
  return (
    <div className="section-heading">
      <div>
        <span className="eyebrow">A NEW CREATIVE CURRENT</span>
        <h1>
          Find your next <em>what if.</em>
        </h1>
      </div>
      <NavLink className="text-link" to="/create">
        Start creating <ArrowUpRight size={17} />
      </NavLink>
    </div>
  );
}
export function FeedPreview() {
  return (
    <div className="feed-page">
      <FeedHeading />
      <div className="discovery-layout">
        <article className="feed-card concept-feed">
          <img
            src="/images/desert-dancer.png"
            alt="Concept artwork of a dancer in sunlit dunes"
          />
          <div className="feed-caption">
            <span className="preview-tag">STYLE STUDY · CONCEPT ARTWORK</span>
            <h2>Let the light lead.</h2>
            <p>A little movement. A new perspective.</p>
            <NavLink to="/create" className="button button--primary">
              Make something yours <ArrowUpRight size={16} />
            </NavLink>
          </div>
        </article>
        <aside className="discovery-note">
          <span className="eyebrow">BUILT TO BE REIMAGINED</span>
          <h2>
            One idea.
            <br />
            Endless possibilities.
          </h2>
          <p>
            Discover a moment that moves you. Give it your own point of view.
            Keep the creative chain going.
          </p>
          <div className="note-divider" />
          <p className="notice">
            Your next inspiration starts here. Live videos and creator
            attribution appear when your community is connected.
          </p>
        </aside>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { Volume2, VolumeX, ArrowUpRight } from "lucide-react";
import { api, usePaginatedQuery } from "@virel/api-client";
import { Button, EmptyState } from "@virel/ui";
function Video({ url, muted }: { url: string; muted: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && document.visibilityState === "visible") {
          void video.play().catch(() => {});
        } else video.pause();
      },
      { threshold: 0.7 },
    );
    const pause = () => {
      if (document.hidden) video.pause();
    };
    observer.observe(video);
    document.addEventListener("visibilitychange", pause);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", pause);
      video.pause();
    };
  }, []);
  return (
    <video
      ref={ref}
      src={url}
      controls
      playsInline
      muted={muted}
      loop
      preload="metadata"
      onError={(e) => {
        e.currentTarget.setAttribute(
          "aria-label",
          "Video unavailable. Try another video.",
        );
      }}
    />
  );
}
export function Feed() {
  const { results, status, loadMore } = usePaginatedQuery(
    api.feed.list,
    {},
    { initialNumItems: 5 },
  );
  const [muted, setMuted] = useState(true);
  return (
    <div className="feed-page">
      <FeedHeading />
      {status === "LoadingFirstPage" ? (
        <p role="status">Finding your next inspiration…</p>
      ) : !results.length ? (
        <EmptyState title="The first wave starts with you.">
          No published videos yet. Your creative community is taking shape.
        </EmptyState>
      ) : (
        <div className="feed-column">
          {results.map((video) => (
            <article className="feed-card" key={video._id}>
              <Video url={video.playbackUrl} muted={muted} />
              <div className="feed-caption">
                <span className="eyebrow">
                  @{video.creator?.username ?? "creator"}
                </span>
                <h2>{video.title}</h2>
                <p>{video.description}</p>
                <div className="feed-actions">
                  <Button
                    onClick={() => setMuted(!muted)}
                    aria-label={muted ? "Enable sound" : "Mute videos"}
                  >
                    {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                  </Button>
                  <span className="status">
                    {video.royaltyEligible
                      ? "Platform original"
                      : "Preview media"}
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      {status === "CanLoadMore" && (
        <Button onClick={() => loadMore(5)}>Load more</Button>
      )}
      {status === "LoadingMore" && <p role="status">Loading more…</p>}
    </div>
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

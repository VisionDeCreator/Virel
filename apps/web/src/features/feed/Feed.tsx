import { useState } from "react";
import { api, usePaginatedQuery } from "@virel/api-client";
import { Button, EmptyState } from "@virel/ui";
export function Feed() {
  const { results, status, loadMore } = usePaginatedQuery(
    api.feed.list,
    {},
    { initialNumItems: 5 },
  );
  const [muted, setMuted] = useState(true);
  if (status === "LoadingFirstPage")
    return <p role="status">Loading your feed…</p>;
  if (!results.length)
    return (
      <EmptyState title="The first wave starts with you.">
        No published videos yet. An operator can import controlled preview media
        while generation is being built.
      </EmptyState>
    );
  return (
    <section className="feed">
      <div className="section-heading">
        <h1>For you</h1>
        <span>Discover your next idea</span>
      </div>
      {results.map((video) => (
        <article className="video-card" key={video._id}>
          <video
            src={video.playbackUrl}
            controls
            playsInline
            muted={muted}
            loop
            preload="metadata"
          />
          <div className="video-caption">
            <span className="eyebrow">
              @{video.creator?.username ?? "creator"}
            </span>
            <h2>{video.title}</h2>
            <p>{video.description}</p>
            <Button onClick={() => setMuted(!muted)}>
              {muted ? "Enable sound" : "Mute videos"}
            </Button>
          </div>
        </article>
      ))}
      {status === "CanLoadMore" && (
        <Button onClick={() => loadMore(5)}>Load more</Button>
      )}
      {status === "LoadingMore" && <p role="status">Loading more…</p>}
    </section>
  );
}

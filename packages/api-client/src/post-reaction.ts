import { useMutation } from "convex/react";
import { api } from "@virel/backend";

/** Apply instant feedback to every loaded feed page; Convex rolls it back on failure. */
export function usePostReaction() {
  return useMutation(api.feed.setReaction).withOptimisticUpdate(
    (store, args) => {
      for (const query of store.getAllQueries(api.feed.list)) {
        if (!query.value) continue;
        store.setQuery(api.feed.list, query.args, {
          ...query.value,
          page: query.value.page.flatMap((post) => {
            if (post._id !== args.videoId) return [post];
            if (args.kind === "dismiss" && args.active) return [];
            if (args.kind === "bookmark")
              return query.args.mode === "saved" && !args.active
                ? []
                : [{ ...post, bookmarked: args.active }];
            if (args.kind === "like")
              return [
                {
                  ...post,
                  liked: args.active,
                  likeCount: Math.max(
                    0,
                    post.likeCount +
                      (args.active === post.liked ? 0 : args.active ? 1 : -1),
                  ),
                },
              ];
            return [post];
          }),
        });
      }
      for (const query of store.getAllQueries(api.feed.post)) {
        const post = query.value;
        if (!post || post._id !== args.videoId) continue;
        if (args.kind === "like")
          store.setQuery(api.feed.post, query.args, {
            ...post,
            liked: args.active,
            likeCount: Math.max(
              0,
              post.likeCount +
                (args.active === post.liked ? 0 : args.active ? 1 : -1),
            ),
          });
        if (args.kind === "bookmark")
          store.setQuery(api.feed.post, query.args, {
            ...post,
            bookmarked: args.active,
          });
      }
    },
  );
}

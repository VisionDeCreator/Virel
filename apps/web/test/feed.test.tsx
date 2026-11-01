import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { Feed } from "../src/features/feed/Feed";
const fake = vi.hoisted(() => ({
  authenticated: true,
  reaction: vi.fn(),
  mutation: vi.fn(),
  loadMore: vi.fn(),
  preferences: { affinities: [], seen: [] },
  status: "CanLoadMore",
  posts: [
    {
      _id: "video-1",
      creatorId: "user-1",
      title: "A creative moment",
      description: "Made to remix",
      playbackUrl: "https://example.com/a.mp4",
      creator: { username: "alice" },
      rootCreator: null,
      parentCreator: null,
      likeCount: 3,
      commentCount: 1,
      liked: false,
      bookmarked: false,
      isFollowing: false,
      isOwner: false,
      remixEnabled: true,
    },
  ],
}));
vi.mock("@virel/api-client", () => ({
  api: {
    feed: {
      list: "list",
      preferences: "preferences",
      post: "post",
      watch: "watch",
      comments: "comments",
      addComment: "addComment",
      deleteComment: "deleteComment",
      hide: "hide",
      report: "report",
    },
    profiles: { setFollowing: "following" },
  },
  useQuery: (ref: string) => (ref === "preferences" ? fake.preferences : null),
  useConvexAuth: () => ({ isAuthenticated: fake.authenticated }),
  useMutation: () => fake.mutation,
  usePostReaction: () => fake.reaction,
  usePaginatedQuery: (ref: string) =>
    ref === "comments"
      ? { results: [], status: "Exhausted", loadMore: fake.loadMore }
      : { results: fake.posts, status: fake.status, loadMore: fake.loadMore },
}));
const observers: {
  callback: IntersectionObserverCallback;
  target?: Element;
  options?: IntersectionObserverInit;
}[] = [];
beforeEach(() => {
  sessionStorage.clear();
  fake.authenticated = true;
  fake.status = "CanLoadMore";
  fake.reaction.mockReset().mockResolvedValue(null);
  fake.mutation.mockReset().mockResolvedValue(null);
  fake.loadMore.mockReset();
  observers.length = 0;
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      entry: (typeof observers)[number];
      constructor(
        callback: IntersectionObserverCallback,
        options?: IntersectionObserverInit,
      ) {
        this.entry = { callback, options };
        observers.push(this.entry);
      }
      observe(target: Element) {
        this.entry.target = target;
      }
      disconnect() {}
    },
  );
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function mount() {
  return render(
    <MemoryRouter>
      <Feed />
    </MemoryRouter>,
  );
}
function intersect(selector: string) {
  act(() => {
    for (const o of observers.filter((o) => o.target?.matches(selector)))
      o.callback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
  });
}
test("automatically loads near the bottom and exposes all post actions", async () => {
  mount();
  expect(screen.getByText("A creative moment")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Remix" }).getAttribute("href")).toBe(
    "/create?source=video-1",
  );
  intersect(".feed-sentinel");
  expect(fake.loadMore).toHaveBeenCalledWith(12);
  await userEvent.setup().click(screen.getByRole("button", { name: "Like" }));
  expect(fake.reaction).toHaveBeenCalledWith({
    videoId: "video-1",
    kind: "like",
    active: true,
  });
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Bookmark" }));
  expect(fake.reaction).toHaveBeenCalledWith({
    videoId: "video-1",
    kind: "bookmark",
    active: true,
  });
});
test("comments open in a dialog and submit without leaving the feed", async () => {
  mount();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Comments" }));
  expect(screen.getByRole("dialog", { name: "Comments" })).toBeTruthy();
  await user.type(
    screen.getByRole("textbox", { name: "Your comment" }),
    "Beautiful work",
  );
  await user.click(screen.getByRole("button", { name: "Post comment" }));
  expect(fake.mutation).toHaveBeenCalledWith({
    videoId: "video-1",
    body: "Beautiful work",
    parentId: undefined,
  });
  await user.click(screen.getByRole("button", { name: "Close" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByText("A creative moment")).toBeTruthy();
});
test("signed-out interactions explain sign-in and mutation failures remain visible", async () => {
  fake.authenticated = false;
  const view = mount();
  await userEvent.setup().click(screen.getByRole("button", { name: "Like" }));
  expect(fake.reaction).not.toHaveBeenCalled();
  expect(screen.getByText(/Sign in from your profile/)).toBeTruthy();
  view.unmount();
  fake.authenticated = true;
  fake.reaction.mockRejectedValueOnce(new Error("Please try again"));
  mount();
  await userEvent.setup().click(screen.getByRole("button", { name: "Like" }));
  expect(await screen.findByText("Please try again")).toBeTruthy();
});
test("video is mounted near the viewport and pauses while comments are open", async () => {
  mount();
  expect(document.querySelector("video")).toBeNull();
  intersect(".feed-video-frame");
  await waitFor(() =>
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled(),
  );
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Comments" }));
  expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
});

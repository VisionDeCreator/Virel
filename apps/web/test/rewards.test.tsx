import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { Rewards } from "../src/features/profile/Rewards";
import { PublicProfile } from "../src/features/profile/Profile";
const fake = vi.hoisted(() => ({
  owner: true,
  hidden: false,
  toggle: vi.fn(),
  retry: vi.fn(),
  loadMore: vi.fn(),
  error: "",
  busy: false,
}));
vi.mock("@virel/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@virel/api-client")>()),
  useRewards: () => ({
    balance: {
      hidden: fake.hidden,
      pendingUsdMicros: fake.hidden ? null : 15000,
      availableUsdMicros: fake.hidden ? null : 5000,
      earnedUsdMicros: fake.hidden ? null : 20000,
      syncing: false,
    },
    history: {
      results: [
        {
          _id: "e1",
          createdAt: 1,
          kind: "award",
          usdMicros: fake.hidden ? null : 5000,
        },
      ],
      status: "CanLoadMore",
      loadMore: fake.loadMore,
    },
    busy: fake.busy,
    error: fake.error,
    toggleHidden: fake.toggle,
    retry: fake.retry,
  }),
  useQuery: () => ({
    username: "alice",
    displayName: "Alice",
    bio: "A creator",
    hasAvatar: false,
    avatarVersion: 0,
    followers: 2,
    following: 3,
    isOwner: fake.owner,
    isFollowing: false,
  }),
  usePaginatedQuery: () => ({
    results: [],
    status: "Exhausted",
    loadMore: fake.loadMore,
  }),
  useConvexAuth: () => ({ isAuthenticated: true }),
  useApiUrl: () => "",
  useMutation: () => fake.toggle,
}));
beforeEach(() => {
  fake.owner = true;
  fake.hidden = false;
  fake.error = "";
  fake.busy = false;
  fake.toggle.mockReset();
  fake.retry.mockReset();
  fake.loadMore.mockReset();
});
afterEach(cleanup);
test("owner sees precise USD rewards and can change visibility or load activity", async () => {
  render(<Rewards />);
  expect(screen.getByRole("heading", { name: "Your rewards" })).toBeTruthy();
  expect(screen.getByText("$0.015")).toBeTruthy();
  expect(screen.getAllByText("$0.005")).toHaveLength(2);
  expect(
    screen
      .getByRole("button", { name: "Withdrawals coming later" })
      .hasAttribute("disabled"),
  ).toBe(true);
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Hide reward balance" }));
  expect(fake.toggle).toHaveBeenCalledOnce();
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "More reward activity" }));
  expect(fake.loadMore).toHaveBeenCalledWith(10);
});
test("hidden balance masks summary and activity without leaving amounts in the DOM", () => {
  fake.hidden = true;
  const { container } = render(<Rewards />);
  expect(screen.getAllByText("••••")).toHaveLength(4);
  expect(container.textContent).not.toMatch(/\$|0\.005|0\.015|0\.02/);
  expect(
    screen.getByRole("button", { name: "Show reward balance" }),
  ).toBeTruthy();
});
test("another creator’s public profile never renders the rewards panel", () => {
  fake.owner = false;
  render(
    <MemoryRouter>
      <PublicProfile username="alice" />
    </MemoryRouter>,
  );
  expect(screen.queryByRole("heading", { name: "Your rewards" })).toBeNull();
  expect(screen.queryByText("ONLY VISIBLE TO YOU")).toBeNull();
});
test("owner profile places private rewards before the published videos section", () => {
  render(
    <MemoryRouter>
      <PublicProfile username="alice" />
    </MemoryRouter>,
  );
  const rewards = screen.getByRole("heading", { name: "Your rewards" });
  const videos = screen.getByRole("heading", { name: "Published videos" });
  expect(
    rewards.compareDocumentPosition(videos) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});
test("visibility errors expose a retry without claiming the preference was saved", async () => {
  fake.error = "Unable to save balance visibility. Please try again.";
  render(<Rewards />);
  expect(screen.getByText(fake.error)).toBeTruthy();
  await userEvent.setup().click(screen.getByRole("button", { name: "Retry" }));
  expect(fake.retry).toHaveBeenCalledOnce();
});

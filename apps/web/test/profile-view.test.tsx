import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ProfileView } from "../src/features/profile/ProfileView";
afterEach(cleanup);
const profile = {
  username: "mira",
  displayName: "Mira",
  bio: "Public bio",
  hasAvatar: false,
  avatarVersion: 0,
  followers: 3,
  following: 2,
  isOwner: false,
  isFollowing: false,
};
test("visitor profile exposes follow controls and published content without financial fields", async () => {
  const follow = vi.fn();
  render(
    <MemoryRouter>
      <ProfileView
        profile={profile}
        isAuthenticated
        busy={false}
        onFollow={follow}
        onShare={() => {}}
        message=""
      >
        <p>Published sample</p>
      </ProfileView>
    </MemoryRouter>,
  );
  await userEvent.setup().click(screen.getByRole("button", { name: "Follow" }));
  expect(follow).toHaveBeenCalledOnce();
  expect(screen.getByRole("heading", { name: "Mira" })).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Edit profile" })).toBeNull();
  expect(screen.queryByText(/credits|billing|reserved/i)).toBeNull();
});
test("owner profile links to separate account settings instead of showing an edit form", () => {
  render(
    <MemoryRouter>
      <ProfileView
        profile={{ ...profile, isOwner: true }}
        isAuthenticated
        busy={false}
        onFollow={() => {}}
        onShare={() => {}}
        message=""
      >
        <p>No videos yet.</p>
      </ProfileView>
    </MemoryRouter>,
  );
  expect(
    screen.getByRole("link", { name: "Edit profile" }).getAttribute("href"),
  ).toBe("/settings?tab=account");
  expect(screen.queryByRole("button", { name: "Follow" })).toBeNull();
  expect(screen.queryByRole("textbox")).toBeNull();
});

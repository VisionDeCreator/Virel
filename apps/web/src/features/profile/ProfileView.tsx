import type { ReactNode } from "react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@virel/api-client";
import { NavLink } from "react-router-dom";
import { Avatar, Button, Notice } from "@virel/ui";
type PublicProfileData = NonNullable<
  FunctionReturnType<typeof api.profiles.publicProfile>
>;
export function ProfileView({
  profile,
  avatarUrl,
  isAuthenticated,
  busy,
  onFollow,
  onShare,
  message,
  children,
}: {
  profile: PublicProfileData;
  avatarUrl?: string;
  isAuthenticated: boolean;
  busy: boolean;
  onFollow: () => void;
  onShare: () => void;
  message: string;
  children: ReactNode;
}) {
  return (
    <section className="social-profile">
      <div className="profile-cover" aria-hidden="true" />
      <div className="social-identity">
        <div>
          {profile.hasAvatar && avatarUrl ? (
            <img
              className="profile-photo"
              src={avatarUrl}
              alt={`${profile.displayName}’s profile picture`}
            />
          ) : (
            <Avatar name={profile.displayName} size="large" />
          )}
          <h1>{profile.displayName}</h1>
          <p>@{profile.username}</p>
          <p>{profile.bio}</p>
          <div className="profile-counts">
            <span>
              <strong>{profile.followers.toLocaleString()}</strong> followers
            </span>
            <span>
              <strong>{profile.following.toLocaleString()}</strong> following
            </span>
          </div>
        </div>
        <div className="profile-actions">
          {profile.isOwner ? (
            <NavLink
              className="button button--primary"
              to="/settings?tab=account"
            >
              Edit profile
            </NavLink>
          ) : isAuthenticated ? (
            <Button
              variant={profile.isFollowing ? "secondary" : "primary"}
              disabled={busy}
              onClick={onFollow}
            >
              {profile.isFollowing ? "Following · Unfollow" : "Follow"}
            </Button>
          ) : (
            <NavLink className="button button--primary" to="/profile">
              Sign in to follow
            </NavLink>
          )}
          <Button onClick={onShare}>Share profile</Button>
        </div>
      </div>
      {message && <Notice>{message}</Notice>}
      <h2 className="profile-video-heading">Published videos</h2>
      {children}
    </section>
  );
}

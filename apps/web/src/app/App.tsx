import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import {
  Home,
  Compass,
  Plus,
  Bell,
  User,
  ArrowUpRight,
  Settings as SettingsIcon,
} from "lucide-react";
import { EmptyState } from "@virel/ui";
import { api, useQuery, useConvexAuth, useApiUrl } from "@virel/api-client";
import { navigation } from "@virel/shared";
import { Feed, FeedPreview } from "../features/feed/Feed";
import { Profile, ProfilePreview } from "../features/profile/Profile";
import { Studio } from "../features/studio/Studio";
import { Settings } from "../features/settings/Settings";
const icons = [Home, Compass, Plus, Bell, User];
export function App({ connected }: { connected: boolean }) {
  const path = useLocation().pathname;
  const title =
    path === "/"
      ? "Discover"
      : path === "/create"
        ? "Your creations"
        : path === "/profile"
          ? "Your profile"
          : path.startsWith("/u/")
            ? "Creator profile"
            : path.slice(1);
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <NavLink to="/" className="wordmark">
          <span className="brand-mark">v</span>virel
        </NavLink>
        <nav aria-label="Main navigation">
          {navigation.map((name, i) => {
            const Icon = icons[i];
            return (
              <NavLink
                key={name}
                to={i === 0 ? "/" : `/${name.toLowerCase()}`}
                end={i === 0}
              >
                <Icon size={21} aria-hidden="true" />
                {name}
              </NavLink>
            );
          })}
        </nav>
        {connected ? (
          <AccountSidebar />
        ) : (
          <div className="sidebar-account">
            <NavLink to="/profile">
              <User size={20} /> Your profile
            </NavLink>
            <NavLink to="/settings">
              <SettingsIcon size={20} /> Settings
            </NavLink>
          </div>
        )}
      </aside>
      <main>
        <header>
          <span className="page-label">{title}</span>
          <div className="header-end">
            {connected && (path === "/create" || path === "/settings") && (
              <CreditBalance />
            )}
            {!connected && <span className="status">Design preview</span>}
            <NavLink
              to="/profile"
              className="account-link"
              aria-label="Open your profile"
            >
              <User size={19} />
            </NavLink>
          </div>
        </header>
        <Routes>
          <Route
            path="/u/:username"
            element={connected ? <Profile /> : <ProfilePreview />}
          />
          <Route
            path="/settings"
            element={<Settings connected={connected} />}
          />
          <Route path="/" element={connected ? <Feed /> : <FeedPreview />} />
          <Route
            path="/profile"
            element={connected ? <Profile /> : <ProfilePreview />}
          />
          <Route path="/create" element={<Studio connected={connected} />} />
          {["explore", "activity"].map((path) => (
            <Route
              key={path}
              path={`/${path}`}
              element={
                <EmptyState
                  title={
                    path === "explore"
                      ? "Find your next inspiration."
                      : "Your creative circle starts here."
                  }
                >
                  This space is taking shape. In the meantime, explore your feed
                  or start a new idea.
                </EmptyState>
              }
            />
          ))}
          <Route
            path="*"
            element={
              <EmptyState title="Page not found">
                Use the navigation to return to your feed.
              </EmptyState>
            }
          />
        </Routes>
      </main>
    </div>
  );
}

function CreditBalance() {
  const { isAuthenticated } = useConvexAuth();
  const balance = useQuery(api.credits.balance, isAuthenticated ? {} : "skip");
  return isAuthenticated ? (
    <NavLink to="/create" className="status">
      {balance?.available ?? 0} credits
    </NavLink>
  ) : null;
}

function AccountSidebar() {
  const apiUrl = useApiUrl();
  const { isAuthenticated } = useConvexAuth();
  const profile = useQuery(api.profiles.me, isAuthenticated ? {} : "skip");
  return (
    <div className="sidebar-account">
      <NavLink to="/profile">
        {profile?.avatarAssetId && apiUrl ? (
          <img
            src={`${apiUrl}/avatars/${profile.username}?v=${profile.avatarVersion ?? 0}`}
            alt="Your profile picture"
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              objectFit: "cover",
            }}
          />
        ) : (
          <User size={20} />
        )}
        <span>
          {profile?.displayName ?? "Your profile"}
          {profile && (
            <small style={{ display: "block", color: "var(--muted)" }}>
              @{profile.username}
            </small>
          )}
        </span>
      </NavLink>
      <NavLink to="/settings?tab=account">
        <SettingsIcon size={20} /> Settings
      </NavLink>
    </div>
  );
}

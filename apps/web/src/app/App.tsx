import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import { Home, Compass, Plus, Bell, User, ArrowUpRight } from "lucide-react";
import { EmptyState } from "@virel/ui";
import { navigation } from "@virel/shared";
import { Feed, FeedPreview } from "../features/feed/Feed";
import { Profile, ProfilePreview } from "../features/profile/Profile";
import { Studio } from "../features/studio/Studio";
const icons = [Home, Compass, Plus, Bell, User];
export function App({ connected }: { connected: boolean }) {
  const path = useLocation().pathname;
  const title =
    path === "/"
      ? "Discover"
      : path === "/create"
        ? "Studio"
        : path === "/profile"
          ? "Your profile"
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
        <div className="sidebar-note">
          <span className="eyebrow">A LITTLE IMAGINATION.</span>
          <p>
            A whole new
            <br />
            point of view.
          </p>
          <NavLink to="/create">
            Make something <ArrowUpRight size={15} />
          </NavLink>
        </div>
      </aside>
      <main>
        <header>
          <span className="page-label">{title}</span>
          <div className="header-end">
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

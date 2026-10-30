import { NavLink, Route, Routes } from "react-router-dom";
import { EmptyState } from "@virel/ui";
import { navigation } from "@virel/shared";
import { Feed } from "../features/feed/Feed";
import { Profile } from "../features/profile/Profile";
export function App({ connected }: { connected: boolean }) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="wordmark" href="/">
          virel<span>✦</span>
        </a>
        <p className="tagline">A new creative current.</p>
        <nav aria-label="Main navigation">
          {navigation.map((name, i) => (
            <NavLink
              key={name}
              to={i === 0 ? "/" : `/${name.toLowerCase()}`}
              end={i === 0}
            >
              <span aria-hidden="true">{["◈", "⌕", "+", "♡", "◎"][i]}</span>
              {name}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-note">
          Create. Remix.
          <br />
          Make it yours.
        </div>
      </aside>
      <main>
        <header>
          <span>THE NEXT WAVE OF CREATIVITY</span>
          <span className="status">
            {connected ? "Connected to Virel" : "Foundation preview"}
          </span>
        </header>
        <Routes>
          <Route
            path="/"
            element={
              connected ? (
                <Feed />
              ) : (
                <EmptyState title="Your next inspiration starts here.">
                  Connect your Convex deployment to load the shared video feed.
                  No demo activity or earnings are simulated.
                </EmptyState>
              )
            }
          />
          <Route
            path="/profile"
            element={
              connected ? (
                <Profile />
              ) : (
                <EmptyState title="One identity. Every screen.">
                  Connect Convex to sign in and create your profile across web
                  and mobile.
                </EmptyState>
              )
            }
          />
          {["explore", "create", "activity"].map((path) => (
            <Route
              key={path}
              path={`/${path}`}
              element={
                <EmptyState
                  title={
                    path === "create"
                      ? "Give your imagination a moving picture."
                      : `${path[0].toUpperCase()}${path.slice(1)} is taking shape.`
                  }
                >
                  This destination is reserved for the next milestone.
                  Generation and payments are not enabled.
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

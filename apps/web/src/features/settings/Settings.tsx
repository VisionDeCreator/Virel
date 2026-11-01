import { useState } from "react";
import { NavLink, useSearchParams } from "react-router-dom";
import {
  api,
  useQuery,
  useConvexAuth,
  useAuthActions,
} from "@virel/api-client";
import { Panel, Notice, Button } from "@virel/ui";
import { creditEventLabel } from "@virel/shared";
import { ProfileForm } from "../profile/Profile";
import { AvatarUpload } from "./AvatarUpload";
export function Settings({ connected }: { connected: boolean }) {
  const [params] = useSearchParams();
  const tab = params.get("tab") ?? "account";
  return (
    <section className="account-settings">
      <h1>Settings</h1>
      <p>Only you can see your account information.</p>
      <div className="settings-layout">
        <nav aria-label="Settings sections" className="settings-tabs">
          {[
            { key: "account", label: "Account" },
            { key: "billing", label: "Billing" },
            { key: "credits", label: "Credit activity" },
            { key: "security", label: "Security" },
          ].map((item) => (
            <NavLink
              key={item.key}
              aria-current={tab === item.key ? "page" : undefined}
              to={`/settings?tab=${item.key}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div>
          {connected ? (
            <ConnectedSettings tab={tab} />
          ) : (
            <Panel>
              <h2>
                {tab === "credits" ? "Credit activity" : "Account settings"}
              </h2>
              <p>Connect your account to manage settings.</p>
            </Panel>
          )}
        </div>
      </div>
    </section>
  );
}
function ConnectedSettings({ tab }: { tab: string }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  return isLoading ? (
    <Notice>Loading settings…</Notice>
  ) : isAuthenticated ? (
    tab === "credits" ? (
      <CreditActivity />
    ) : tab === "billing" ? (
      <Panel>
        <h2>Billing</h2>
        <p>
          Paid top-ups and subscriptions are not available yet. You won’t be
          charged automatically.
        </p>
        <NavLink className="text-link" to="/settings?tab=credits">
          View credit activity →
        </NavLink>
      </Panel>
    ) : tab === "security" ? (
      <Security />
    ) : (
      <Account />
    )
  ) : (
    <Notice>
      <NavLink to="/profile">Sign in</NavLink> to manage your account.
    </Notice>
  );
}
function Account() {
  const profile = useQuery(api.profiles.me);
  return (
    <div className="account-panels">
      <ProfileForm />
      {profile && (
        <AvatarUpload
          username={profile.username}
          hasAvatar={Boolean(profile.avatarAssetId)}
          version={profile.avatarVersion ?? 0}
        />
      )}
    </div>
  );
}
function Security() {
  const { signOut } = useAuthActions();
  const [error, setError] = useState("");
  return (
    <Panel>
      <h2>Security</h2>
      <p>Your account uses email verification codes to sign in.</p>
      <Button
        onClick={() =>
          void signOut().catch(() => setError("Unable to sign out. Try again."))
        }
      >
        Sign out
      </Button>
      {error && <Notice error>{error}</Notice>}
    </Panel>
  );
}
function CreditActivity() {
  const balance = useQuery(api.credits.balance);
  const history = useQuery(api.credits.history);
  return (
    <Panel>
      <h2>Credit activity</h2>
      <p>
        {balance
          ? `${balance.available.toLocaleString()} available · ${balance.reserved.toLocaleString()} reserved`
          : "Loading balance…"}
      </p>
      {history === undefined ? (
        <p role="status">Loading credit activity…</p>
      ) : !history.length ? (
        <p>No credit activity yet.</p>
      ) : (
        history.map((event) => (
          <div className="credit-row" key={event._id}>
            <div>
              <strong>{creditEventLabel(event.kind)}</strong>
              <p>{event.note}</p>
              <small>{new Date(event._creationTime).toLocaleString()}</small>
            </div>
            <strong>
              {event.kind === "grant" || event.kind === "release" ? "+" : "−"}
              {Math.abs(event.amount).toLocaleString()} credits
            </strong>
          </div>
        ))
      )}
    </Panel>
  );
}

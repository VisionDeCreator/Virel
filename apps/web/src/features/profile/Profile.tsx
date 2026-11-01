import { useState, type FormEvent } from "react";
import {
  api,
  useQuery,
  useMutation,
  useAuthActions,
  useEmailSignIn,
  useConvexAuth,
} from "@virel/api-client";
import { Button, Panel, Avatar, Field, TextArea, Notice } from "@virel/ui";
export function Profile() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signOut } = useAuthActions();
  const [error, setError] = useState("");
  if (isLoading) return <Notice>Checking your session…</Notice>;
  if (!isAuthenticated) return <EmailSignIn />;
  return (
    <section className="profile">
      <ProfileForm />
      <PublishedVideos />
      <Button
        variant="ghost"
        onClick={() =>
          void signOut().catch(() => setError("Unable to sign out. Try again."))
        }
      >
        Sign out
      </Button>
      {error && <Notice error>{error}</Notice>}
    </section>
  );
}
function EmailSignIn() {
  const login = useEmailSignIn();
  return (
    <section className="profile">
      <span className="eyebrow">YOUR CREATIVE HOME</span>
      <h1>{login.challenge ? "Check your email." : "Welcome to Virel."}</h1>
      <p>Sign in or create an account with an email code.</p>
      <Panel>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void (login.challenge ? login.verify() : login.request());
          }}
        >
          <Field
            label="Email"
            type="email"
            required
            autoComplete="email"
            value={login.email}
            readOnly={!!login.challenge}
            onChange={(event) => login.setEmail(event.target.value)}
          />
          {login.challenge && (
            <>
              <p>
                Enter the six-digit code sent to {login.challenge.email}. It
                expires in 10 minutes.
              </p>
              <Field
                label="Verification code"
                required
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={login.code}
                onChange={(event) =>
                  login.setCode(event.target.value.replace(/\D/g, ""))
                }
              />
            </>
          )}
          {login.expired && (
            <Notice error>This code has expired. Request a new code.</Notice>
          )}
          <Button
            type="submit"
            variant="primary"
            disabled={
              login.busy ||
              (login.challenge
                ? login.expired || login.code.length !== 6
                : login.wait > 0)
            }
          >
            {login.busy
              ? "Please wait…"
              : login.challenge
                ? "Verify & sign in"
                : login.wait
                  ? `Try again in ${login.wait}s`
                  : "Send sign-in code"}
          </Button>
        </form>
        {login.challenge && (
          <>
            <Button
              variant="ghost"
              disabled={login.busy || login.wait > 0}
              onClick={() => void login.request()}
            >
              {login.wait ? `Resend in ${login.wait}s` : "Resend code"}
            </Button>
            <Button
              variant="ghost"
              disabled={login.busy}
              onClick={login.changeEmail}
            >
              Use another email
            </Button>
          </>
        )}
        {login.error && <Notice error>{login.error}</Notice>}
      </Panel>
    </section>
  );
}
function ProfileForm() {
  const profile = useQuery(api.profiles.me);
  const save = useMutation(api.profiles.save);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  if (profile === undefined) return <Notice>Loading profile…</Notice>;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError(false);
    const data = new FormData(event.currentTarget);
    try {
      await save({
        username: String(data.get("username")),
        displayName: String(data.get("displayName")),
        bio: String(data.get("bio")),
      });
      setMessage("Profile saved across your devices.");
    } catch {
      setError(true);
      setMessage(
        "Unable to save. Check your details and username availability.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="profile-identity">
        <Avatar name={profile?.displayName ?? "You"} size="large" />
        <div>
          <span className="eyebrow">YOUR CREATIVE IDENTITY</span>
          <h1>{profile?.displayName ?? "Make your mark."}</h1>
          <p>
            {profile ? `@${profile.username}` : "Your profile starts with you."}
          </p>
        </div>
      </div>
      <Panel>
        <h2>Your point of view.</h2>
        <form key={profile?._id ?? "new"} onSubmit={submit}>
          <Field
            label="Username"
            name="username"
            defaultValue={profile?.username}
            pattern="[a-zA-Z0-9_]{3,24}"
            maxLength={24}
            required
            hint="3–24 letters, numbers, or underscores"
          />
          <Field
            label="Display name"
            name="displayName"
            defaultValue={profile?.displayName}
            maxLength={60}
            required
          />
          <TextArea
            label="Biography"
            name="bio"
            defaultValue={profile?.bio}
            maxLength={160}
          />
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "Saving…" : "Save profile"}
          </Button>
        </form>
        {message && <Notice error={error}>{message}</Notice>}
      </Panel>
    </>
  );
}
export function ProfilePreview() {
  return (
    <section className="profile profile-preview">
      <div className="profile-identity">
        <Avatar name="You" size="large" />
        <div>
          <span className="eyebrow">YOUR CREATIVE HOME</span>
          <h1>Make your mark.</h1>
          <p>One identity. Every screen.</p>
        </div>
      </div>
      <Panel>
        <h2>A space that's yours.</h2>
        <p>
          Your originals, your remixes, your point of view. Build a profile that
          connects it all.
        </p>
        <Field
          label="Username"
          placeholder="your_name"
          disabled
          hint="Your public handle on Virel"
        />
        <Field
          label="Display name"
          placeholder="How should we call you?"
          disabled
        />
        <TextArea
          label="Biography"
          placeholder="A little about your creative world…"
          rows={3}
          disabled
        />
        <Button variant="primary" disabled>
          Create your profile
        </Button>
        <Notice>
          Account setup will be available when sign-in is connected.
        </Notice>
      </Panel>
    </section>
  );
}

function PublishedVideos() {
  const videos = useQuery(api.generation.myPublished);
  return (
    <Panel>
      <h2>Your published videos</h2>
      {!videos?.length && (
        <p>Your published originals and remixes will appear here.</p>
      )}
      {videos?.map((video) => (
        <article key={video._id}>
          <video
            className="result-video"
            src={video.playbackUrl}
            controls
            playsInline
            preload="metadata"
          />
          <h3>{video.title}</h3>
          <p>{video.description}</p>
        </article>
      ))}
    </Panel>
  );
}

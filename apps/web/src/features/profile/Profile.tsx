import { useState, type FormEvent } from "react";
import {
  api,
  useQuery,
  useMutation,
  useAuthActions,
  useConvexAuth,
} from "@virel/api-client";
import { Button, Panel, Avatar, Field, TextArea, Notice } from "@virel/ui";
export function Profile() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signIn, signOut } = useAuthActions();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [flow, setFlow] = useState("signIn");
  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    data.set("flow", flow);
    try {
      await signIn("password", data);
    } catch {
      setError("Unable to sign in. Check your details and try again.");
    } finally {
      setBusy(false);
    }
  }
  if (isLoading) return <Notice>Checking your session…</Notice>;
  if (isAuthenticated)
    return (
      <section className="profile">
        <ProfileForm />
        <Button
          variant="ghost"
          onClick={() => {
            void signOut().catch(() =>
              setError("Unable to sign out. Try again."),
            );
          }}
        >
          Sign out
        </Button>
        {error && <Notice error>{error}</Notice>}
      </section>
    );
  return (
    <section className="profile">
      <span className="eyebrow">YOUR CREATIVE HOME</span>
      <h1>{flow === "signIn" ? "Welcome back." : "Make your mark."}</h1>
      <p>One account for Virel on web and mobile.</p>
      <Panel>
        <form onSubmit={authenticate}>
          <Field
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
          <Field
            label="Password"
            name="password"
            type="password"
            minLength={8}
            autoComplete={
              flow === "signIn" ? "current-password" : "new-password"
            }
            required
          />
          <Button type="submit" variant="primary" disabled={busy}>
            {busy
              ? "Please wait…"
              : flow === "signIn"
                ? "Sign in"
                : "Create account"}
          </Button>
        </form>
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => {
            setFlow(flow === "signIn" ? "signUp" : "signIn");
            setError("");
          }}
        >
          {flow === "signIn"
            ? "New here? Create an account"
            : "Already have an account?"}
        </Button>
        {error && <Notice error>{error}</Notice>}
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

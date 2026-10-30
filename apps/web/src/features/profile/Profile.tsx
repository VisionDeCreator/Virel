import { useState, type FormEvent } from "react";
import {
  api,
  useQuery,
  useMutation,
  useAuthActions,
  useConvexAuth,
} from "@virel/api-client";
import { Button } from "@virel/ui";
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
  if (isLoading) return <p role="status">Checking your session…</p>;
  if (isAuthenticated)
    return (
      <section className="profile">
        <ProfileForm />
        <Button
          onClick={() => {
            void signOut().catch(() =>
              setError("Unable to sign out. Try again."),
            );
          }}
        >
          Sign out
        </Button>
        {error && <p role="alert">{error}</p>}
      </section>
    );
  return (
    <section className="profile">
      <span className="eyebrow">YOUR CREATIVE HOME</span>
      <h1>{flow === "signIn" ? "Welcome back." : "Make your mark."}</h1>
      <p>One account for Virel on web and mobile.</p>
      <form onSubmit={authenticate}>
        <label>
          Email
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            minLength={8}
            autoComplete={
              flow === "signIn" ? "current-password" : "new-password"
            }
            required
          />
        </label>
        <Button disabled={busy}>
          {busy
            ? "Please wait…"
            : flow === "signIn"
              ? "Sign in"
              : "Create account"}
        </Button>
      </form>
      <Button onClick={() => setFlow(flow === "signIn" ? "signUp" : "signIn")}>
        {flow === "signIn"
          ? "New here? Create an account"
          : "Already have an account?"}
      </Button>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
function ProfileForm() {
  const profile = useQuery(api.profiles.me);
  const save = useMutation(api.profiles.save);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  if (profile === undefined) return <p role="status">Loading profile…</p>;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const data = new FormData(event.currentTarget);
    try {
      await save({
        username: String(data.get("username")),
        displayName: String(data.get("displayName")),
        bio: String(data.get("bio")),
      });
      setMessage("Profile saved across your devices.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to save profile.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h1>Your profile</h1>
      <p>Build your creative identity.</p>
      <form key={profile?._id ?? "new"} onSubmit={submit}>
        <label>
          Username
          <input
            name="username"
            defaultValue={profile?.username}
            pattern="[a-zA-Z0-9_]{3,24}"
            required
          />
        </label>
        <label>
          Display name
          <input
            name="displayName"
            defaultValue={profile?.displayName}
            maxLength={60}
            required
          />
        </label>
        <label>
          Biography
          <textarea name="bio" defaultValue={profile?.bio} maxLength={160} />
        </label>
        <Button disabled={busy}>{busy ? "Saving…" : "Save profile"}</Button>
      </form>
      <p role="status">{message}</p>
    </>
  );
}

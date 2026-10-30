import { useState } from "react";
import { Text, TextInput } from "react-native";
import {
  api,
  useQuery,
  useMutation,
  useConvexAuth,
  useAuthActions,
} from "@virel/api-client";
import { Button } from "@virel/ui-native";
import { Screen, styles } from "../src/components/Screen";
import { client } from "../src/lib/backend";
function Editor() {
  const profile = useQuery(api.profiles.me);
  const save = useMutation(api.profiles.save);
  return profile === undefined ? (
    <Text style={styles.text}>Loading profile…</Text>
  ) : (
    <Fields key={profile?._id ?? "new"} profile={profile} save={save} />
  );
}
function Fields({
  profile,
  save,
}: {
  profile: { username: string; displayName: string; bio: string } | null;
  save: (args: {
    username: string;
    displayName: string;
    bio: string;
  }) => Promise<unknown>;
}) {
  const [username, setUsername] = useState(profile?.username ?? "");
  const [displayName, setDisplayName] = useState(profile?.displayName ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    try {
      await save({ username, displayName, bio });
      setMessage("Profile saved across your devices.");
    } catch {
      setMessage(
        "Unable to save. Check your details and username availability.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Text style={styles.label}>Username</Text>
      <TextInput
        accessibilityLabel="Username"
        style={styles.input}
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        maxLength={24}
      />
      <Text style={styles.label}>Display name</Text>
      <TextInput
        accessibilityLabel="Display name"
        style={styles.input}
        value={displayName}
        onChangeText={setDisplayName}
        maxLength={60}
      />
      <Text style={styles.label}>Biography</Text>
      <TextInput
        accessibilityLabel="Biography"
        style={styles.input}
        value={bio}
        onChangeText={setBio}
        maxLength={160}
        multiline
      />
      <Button
        disabled={busy}
        title={busy ? "Saving…" : "Save profile"}
        onPress={() => {
          void submit();
        }}
      />
      <Text accessibilityLiveRegion="polite" style={styles.text}>
        {message}
      </Text>
    </>
  );
}
function Account() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signIn, signOut } = useAuthActions();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [flow, setFlow] = useState("signIn");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function authenticate() {
    setBusy(true);
    setError("");
    try {
      await signIn("password", { email, password, flow });
      setPassword("");
    } catch {
      setError("Unable to sign in. Check your details and try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen title={isAuthenticated ? "Your profile" : "Your creative home."}>
      {isLoading ? (
        <Text style={styles.text}>Checking session…</Text>
      ) : isAuthenticated ? (
        <>
          <Editor />
          <Button
            title="Sign out"
            onPress={() => {
              void signOut().catch(() =>
                setError("Unable to sign out. Try again."),
              );
            }}
          />
        </>
      ) : (
        <>
          <Text style={styles.label}>Email</Text>
          <TextInput
            accessibilityLabel="Email"
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
          <Text style={styles.label}>Password</Text>
          <TextInput
            accessibilityLabel="Password"
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
          />
          <Button
            disabled={busy}
            title={
              busy
                ? "Please wait…"
                : flow === "signIn"
                  ? "Sign in"
                  : "Create account"
            }
            onPress={() => {
              void authenticate();
            }}
          />
          <Button
            title={
              flow === "signIn"
                ? "New here? Create account"
                : "Already have an account?"
            }
            onPress={() => setFlow(flow === "signIn" ? "signUp" : "signIn")}
          />
        </>
      )}
      <Text accessibilityLiveRegion="polite" style={styles.text}>
        {error}
      </Text>
    </Screen>
  );
}
export default function Profile() {
  return client ? (
    <Account />
  ) : (
    <Screen title="One identity. Every screen.">
      <Text style={styles.text}>
        Connect Convex to create your shared profile.
      </Text>
    </Screen>
  );
}

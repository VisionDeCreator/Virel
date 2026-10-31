import { useState } from "react";
import { Text, View } from "react-native";
import { Link } from "expo-router";
import { colors } from "@virel/design-tokens";
import {
  api,
  useQuery,
  useMutation,
  useConvexAuth,
  useAuthActions,
} from "@virel/api-client";
import { Button, Panel, Field } from "@virel/ui-native";
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
      <Field
        label="Username"
        style={styles.input}
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        maxLength={24}
      />
      <Field
        label="Display name"
        style={styles.input}
        value={displayName}
        onChangeText={setDisplayName}
        maxLength={60}
      />
      <Field
        label="Biography"
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
          <PublishedVideos />
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
          <Field
            label="Email"
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
          <Field
            label="Password"
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
    <Screen title="Make your mark.">
      <Panel>
        <Text style={[styles.label, { fontSize: 22 }]}>
          A space that's yours.
        </Text>
        <Text style={styles.text}>
          One identity. Every screen. Your originals, your remixes, your point
          of view.
        </Text>
        <Field label="Username" placeholder="your_name" editable={false} />
        <Field
          label="Display name"
          placeholder="How should we call you?"
          editable={false}
        />
        <Field
          label="Biography"
          placeholder="A little about your creative world…"
          multiline
          editable={false}
        />
        <Button title="Create your profile" disabled onPress={() => {}} />
        <Text style={styles.text}>
          Account setup will be available when sign-in is connected.
        </Text>
      </Panel>
    </Screen>
  );
}

function PublishedVideos() {
  const videos = useQuery(api.generation.myPublished);
  return (
    <Panel>
      <Text style={styles.label}>Your published videos</Text>
      {!videos?.length && (
        <Text style={styles.text}>
          Your originals and remixes will appear here.
        </Text>
      )}
      {videos?.map((video) => (
        <View key={video._id} style={{ gap: 8 }}>
          <Text style={styles.label}>{video.title}</Text>
          <Text style={styles.text}>{video.description}</Text>
          <Link href={video.playbackUrl} style={{ color: colors.primary }}>
            Watch video →
          </Link>
        </View>
      ))}
    </Panel>
  );
}

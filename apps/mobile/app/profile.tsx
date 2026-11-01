import { NativeRewards } from "../src/features/profile/Rewards";
import { NativePublicProfile } from "../src/features/profile/PublicProfile";
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
  useEmailSignIn,
} from "@virel/api-client";
import { Button, Panel, Field } from "@virel/ui-native";
import { Screen, styles } from "../src/components/Screen";
import { client } from "../src/lib/backend";
export function AccountEditor() {
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
  const profile = useQuery(api.profiles.me, isAuthenticated ? {} : "skip");
  if (isLoading || (isAuthenticated && profile === undefined))
    return (
      <Screen title="Your profile">
        <Text style={styles.text}>Loading profile…</Text>
      </Screen>
    );
  return isAuthenticated && profile ? (
    <NativePublicProfile username={profile.username} />
  ) : (
    <Screen
      title={isAuthenticated ? "Create your profile" : "Your creative home"}
    >
      {isAuthenticated ? (
        <>
          <AccountEditor />
          <NativeRewards />
        </>
      ) : (
        <EmailSignIn />
      )}
    </Screen>
  );
}
export function EmailSignIn() {
  const login = useEmailSignIn();
  return (
    <>
      <Text style={styles.text}>
        Sign in or create an account with an email code.
      </Text>
      <Field
        label="Email"
        style={styles.input}
        value={login.email}
        onChangeText={login.setEmail}
        editable={!login.challenge}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
      />
      {login.challenge && (
        <>
          <Text style={styles.text}>
            Enter the six-digit code sent to your email. It expires in 10
            minutes.
          </Text>
          <Field
            label="Verification code"
            style={styles.input}
            value={login.code}
            onChangeText={(value) => login.setCode(value.replace(/\D/g, ""))}
            keyboardType="number-pad"
            maxLength={6}
            autoComplete="one-time-code"
          />
        </>
      )}
      {login.expired && (
        <Text style={styles.text}>
          This code has expired. Request a new code.
        </Text>
      )}
      <Button
        disabled={
          login.busy ||
          (login.challenge
            ? login.expired || login.code.length !== 6
            : login.wait > 0)
        }
        title={
          login.busy
            ? "Please wait…"
            : login.challenge
              ? "Verify & sign in"
              : login.wait
                ? `Try again in ${login.wait}s`
                : "Send sign-in code"
        }
        onPress={() =>
          void (login.challenge ? login.verify() : login.request())
        }
      />
      {login.challenge && (
        <>
          <Button
            disabled={login.busy || login.wait > 0}
            title={login.wait ? `Resend in ${login.wait}s` : "Resend code"}
            onPress={() => void login.request()}
          />
          <Button
            disabled={login.busy}
            title="Use another email"
            onPress={login.changeEmail}
          />
        </>
      )}
      <Text accessibilityLiveRegion="polite" style={styles.text}>
        {login.error}
      </Text>
    </>
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

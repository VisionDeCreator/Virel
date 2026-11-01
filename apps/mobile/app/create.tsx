import { Text } from "react-native";
import { Link } from "expo-router";
import { useConvexAuth } from "@virel/api-client";
import { colors } from "@virel/design-tokens";
import { Screen, styles } from "../src/components/Screen";
import { client } from "../src/lib/backend";
import { NativeCreationWorkspace } from "../src/features/studio/CreationWorkspace";
function Connected() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  if (isLoading)
    return (
      <Screen title="Your Studio">
        <Text style={styles.text}>Opening Studio…</Text>
      </Screen>
    );
  return isAuthenticated ? (
    <NativeCreationWorkspace />
  ) : (
    <Screen title="Your Studio">
      <Text style={styles.text}>
        Sign in to upload, generate, and publish videos.
      </Text>
      <Link href="/profile" style={{ color: colors.primary }}>
        Open your profile to sign in →
      </Link>
    </Screen>
  );
}
export default function Create() {
  return client ? (
    <Connected />
  ) : (
    <Screen title="Your Studio">
      <Text style={styles.text}>
        Connect the backend to upload, generate, and publish videos.
      </Text>
    </Screen>
  );
}

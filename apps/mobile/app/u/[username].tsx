import { Text } from "react-native";
import { client } from "../../src/lib/backend";
import { Screen, styles } from "../../src/components/Screen";
import { useLocalSearchParams } from "expo-router";
import { NativePublicProfile } from "../../src/features/profile/PublicProfile";
export default function PublicProfile() {
  const { username } = useLocalSearchParams<{ username: string }>();
  return client ? (
    <NativePublicProfile username={username} />
  ) : (
    <Screen title="Profile">
      <Text style={styles.text}>
        Connect the backend to view public profiles.
      </Text>
    </Screen>
  );
}

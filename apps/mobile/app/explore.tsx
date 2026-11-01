import { Text } from "react-native";
import { Screen, styles } from "../src/components/Screen";
export default function Page() {
  return (
    <Screen title="Discover your next idea.">
      <Text style={styles.text}>
        This space is coming soon. Visit Home for inspiration or Create to find
        your videos and start a new idea.
      </Text>
    </Screen>
  );
}

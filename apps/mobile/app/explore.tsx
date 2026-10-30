import { Text } from "react-native";
import { Screen, styles } from "../src/components/Screen";
export default function Page() {
  return (
    <Screen title="Discover your next idea.">
      <Text style={styles.text}>
        This destination is reserved for a later milestone. Generation and
        payments are not enabled.
      </Text>
    </Screen>
  );
}

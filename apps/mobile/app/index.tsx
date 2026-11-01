import { Text, Image } from "react-native";
import { Link } from "expo-router";
import { colors } from "@virel/design-tokens";
import { Screen, styles } from "../src/components/Screen";
import { client } from "../src/lib/backend";
import { HomeFeed } from "../src/features/feed/HomeFeed";
export default function Home() {
  return client ? (
    <HomeFeed />
  ) : (
    <Screen title="Find your next what if.">
      <Text style={styles.text}>
        A new creative current. Discover a moment that moves you.
      </Text>
      <Image
        source={require("../assets/desert-dancer.png")}
        style={{ width: "100%", height: 430, borderRadius: 20 }}
        accessibilityLabel="Concept artwork of a dancer in sunlit dunes"
      />
      <Text style={{ color: colors.primary, fontSize: 10, letterSpacing: 1 }}>
        STYLE STUDY · CONCEPT ARTWORK
      </Text>
      <Text style={[styles.heading, { fontSize: 26 }]}>
        Let the light lead.
      </Text>
      <Text style={styles.text}>
        Live videos and creator attribution appear when your community is
        connected.
      </Text>
      <Link
        href="/create"
        style={{ color: colors.primary, fontSize: 16, paddingVertical: 14 }}
      >
        Make something yours →
      </Link>
    </Screen>
  );
}

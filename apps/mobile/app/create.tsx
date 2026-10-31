import { useState } from "react";
import { Text, Image, View, StyleSheet } from "react-native";
import { Button, Panel, Field, SegmentedControl } from "@virel/ui-native";
import {
  creationModes,
  aspectRatios,
  durations,
  type CreationMode,
} from "@virel/shared";
import { colors } from "@virel/design-tokens";
import { Screen, styles } from "../src/components/Screen";
export default function Create() {
  const [mode, setMode] = useState<CreationMode>("text");
  const [prompt, setPrompt] = useState("");
  const [ratio, setRatio] = useState("9:16");
  const [duration, setDuration] = useState("5");
  return (
    <Screen title="Make it yours.">
      <Text style={styles.text}>A spark of an idea. A whole new world.</Text>
      <SegmentedControl
        label="Creation mode"
        options={creationModes}
        value={mode}
        onChange={setMode}
      />
      <Panel>
        {mode === "image" && (
          <Text style={styles.text}>
            Image uploads will be available when generation launches.
          </Text>
        )}
        {mode === "remix" && (
          <Text style={styles.text}>
            Start from a creator's video when remixing launches. Original
            creators stay credited.
          </Text>
        )}
        <Field
          label={mode === "remix" ? "What would you change?" : "Your prompt"}
          placeholder="A dancer in sunlit dunes, flowing silk, cinematic slow motion…"
          value={prompt}
          onChangeText={setPrompt}
          maxLength={2000}
          multiline
          style={{ minHeight: 150, textAlignVertical: "top" }}
        />
        <Text style={[styles.text, { textAlign: "right", fontSize: 12 }]}>
          {prompt.length}/2,000
        </Text>
        <Text style={styles.label}>Duration</Text>
        <SegmentedControl
          label="Duration"
          options={durations}
          value={duration}
          onChange={setDuration}
        />
        <Text style={styles.label}>Aspect ratio</Text>
        <SegmentedControl
          label="Aspect ratio"
          options={aspectRatios}
          value={ratio}
          onChange={setRatio}
        />
        <Button title="Create video" disabled onPress={() => {}} />
        <Text style={[styles.text, { fontSize: 12 }]}>
          Generation is coming soon. Settings are a preview; no credits will be
          charged.
        </Text>
      </Panel>
      <View style={{ gap: 12 }}>
        <Text style={[styles.label, { fontSize: 22, fontWeight: "600" }]}>
          A little inspiration.
        </Text>
        <Image
          source={require("../assets/desert-dancer.png")}
          style={local.image}
          accessibilityLabel="Concept artwork of a dancer in warm desert light"
        />
        <Text style={local.caption}>
          CONCEPT ARTWORK · NOT A GENERATED RESULT
        </Text>
      </View>
    </Screen>
  );
}
const local = StyleSheet.create({
  image: { width: "100%", height: 320, borderRadius: 20 },
  caption: { fontSize: 10, letterSpacing: 1, color: colors.muted },
});

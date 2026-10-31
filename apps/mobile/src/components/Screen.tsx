import type { ReactNode } from "react";
import {
  ScrollView,
  Text,
  StyleSheet,
  View,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { colors } from "@virel/design-tokens";
export function Screen({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brandRow}>
          <Text style={styles.mark}>v</Text>
          <Text style={styles.brand}>virel</Text>
        </View>
        <Text style={styles.heading}>{title}</Text>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
export const styles = StyleSheet.create({
  content: { padding: 22, paddingBottom: 40, gap: 22 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  mark: { color: colors.primary, fontSize: 28, fontWeight: "900" },
  brand: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -1,
  },
  heading: {
    color: colors.text,
    fontSize: 34,
    lineHeight: 38,
    fontWeight: "700",
    letterSpacing: -1,
  },
  text: { color: colors.muted, fontSize: 15, lineHeight: 24 },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    color: colors.text,
    fontSize: 16,
    minHeight: 48,
  },
  label: { color: colors.text, fontSize: 14 },
});

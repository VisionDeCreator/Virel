import type { ReactNode } from "react";
import { ScrollView, Text, StyleSheet } from "react-native";
import { colors } from "@virel/design-tokens";
export function Screen({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.brand}>virel ✦</Text>
      <Text style={styles.heading}>{title}</Text>
      {children}
    </ScrollView>
  );
}
export const styles = StyleSheet.create({
  content: { padding: 24, gap: 20 },
  brand: { color: colors.primary, fontSize: 18, fontWeight: "800" },
  heading: { color: colors.text, fontSize: 32, fontWeight: "700" },
  text: { color: colors.muted, fontSize: 16, lineHeight: 25 },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    color: colors.text,
  },
  label: { color: colors.text, fontSize: 14 },
});

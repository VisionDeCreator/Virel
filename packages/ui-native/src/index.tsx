import {
  Pressable,
  Text,
  View,
  TextInput,
  StyleSheet,
  type TextInputProps,
  type ViewProps,
} from "react-native";
import { colors, radii } from "@virel/design-tokens";
export function Button({
  title,
  onPress,
  disabled = false,
  variant = "primary",
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary";
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === "secondary" && styles.secondary,
        (pressed || disabled) && { opacity: disabled ? 0.45 : 0.8 },
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          variant === "secondary" && { color: colors.text },
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}
export function Panel({ style, ...props }: ViewProps) {
  return <View {...props} style={[styles.panel, style]} />;
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...props}
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        selectionColor={colors.primary}
        style={[styles.input, props.style]}
      />
    </View>
  );
}
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View accessibilityLabel={label} style={styles.segments}>
      {options.map((option) => (
        <Pressable
          key={option.value}
          accessibilityRole="button"
          accessibilityState={{ selected: value === option.value }}
          onPress={() => onChange(option.value)}
          style={[styles.segment, value === option.value && styles.selected]}
        >
          <Text
            style={{
              color: value === option.value ? colors.primary : colors.muted,
              fontSize: 13,
            }}
          >
            {option.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
export const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    justifyContent: "center",
    backgroundColor: colors.primary,
    padding: 14,
    borderRadius: radii.control,
    alignItems: "center",
  },
  secondary: {
    backgroundColor: colors.elevated,
    borderColor: colors.border,
    borderWidth: 1,
  },
  buttonText: { color: colors.primaryText, fontWeight: "700", fontSize: 15 },
  panel: {
    padding: 20,
    gap: 18,
    borderRadius: radii.panel,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: { color: colors.text, fontSize: 14 },
  input: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.control,
    padding: 14,
    fontSize: 16,
    color: colors.text,
    minHeight: 48,
  },
  segments: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  segment: {
    minHeight: 44,
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
    borderRadius: radii.control,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
  },
  selected: { borderColor: colors.primary, backgroundColor: colors.elevated },
});

import { AccountEditor } from "./profile";
import { AvatarUpload } from "../src/features/profile/AvatarUpload";
import { useState } from "react";
import { Text, View } from "react-native";
import { Link, useLocalSearchParams } from "expo-router";
import {
  api,
  useQuery,
  useConvexAuth,
  useAuthActions,
} from "@virel/api-client";
import { Panel, Button } from "@virel/ui-native";
import { creditEventLabel } from "@virel/shared";
import { colors } from "@virel/design-tokens";
import { Screen, styles } from "../src/components/Screen";
import { client } from "../src/lib/backend";
export default function Settings() {
  const { tab = "account" } = useLocalSearchParams<{ tab?: string }>();
  return (
    <Screen title="Settings">
      <Link href="/profile" style={{ color: colors.primary }}>
        ← Your profile
      </Link>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
        {[
          { key: "account", label: "Account" },
          { key: "billing", label: "Billing" },
          { key: "credits", label: "Credit activity" },
          { key: "security", label: "Security" },
        ].map((item) => (
          <Link
            key={item.key}
            href={{ pathname: "/settings", params: { tab: item.key } }}
            style={{
              paddingVertical: 12,
              color: tab === item.key ? colors.primary : colors.muted,
            }}
          >
            {item.label}
          </Link>
        ))}
      </View>
      {client ? (
        <ConnectedSettings tab={tab} />
      ) : (
        <Text style={styles.text}>
          Connect your account to view credit activity.
        </Text>
      )}
    </Screen>
  );
}
function ConnectedSettings({ tab }: { tab: string }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  return isLoading ? (
    <Text style={styles.text}>Loading settings…</Text>
  ) : isAuthenticated ? (
    tab === "credits" ? (
      <CreditActivity />
    ) : tab === "billing" ? (
      <Panel>
        <Text style={styles.label}>Billing</Text>
        <Text style={styles.text}>
          Paid top-ups and subscriptions are not available yet. You won’t be
          charged automatically.
        </Text>
      </Panel>
    ) : tab === "security" ? (
      <Security />
    ) : (
      <>
        <AccountEditor />
        <AvatarUpload />
      </>
    )
  ) : (
    <Link href="/profile" style={{ color: colors.primary }}>
      Sign in to view your credit activity
    </Link>
  );
}
function CreditActivity() {
  const balance = useQuery(api.credits.balance);
  const history = useQuery(api.credits.history);
  return (
    <Panel>
      <Text style={styles.label}>
        {balance
          ? `${balance.available.toLocaleString()} available · ${balance.reserved.toLocaleString()} reserved`
          : "Loading balance…"}
      </Text>
      {history === undefined ? (
        <Text accessibilityLiveRegion="polite" style={styles.text}>
          Loading credit activity…
        </Text>
      ) : !history.length ? (
        <Text style={styles.text}>No credit activity yet.</Text>
      ) : (
        history.map((event) => (
          <Panel key={event._id}>
            <Text style={styles.label}>{creditEventLabel(event.kind)}</Text>
            <Text style={styles.text}>{event.note}</Text>
            <Text style={styles.label}>
              {event.kind === "grant" || event.kind === "release" ? "+" : "−"}
              {Math.abs(event.amount).toLocaleString()} credits
            </Text>
            <Text style={styles.text}>
              {new Date(event._creationTime).toLocaleString()}
            </Text>
          </Panel>
        ))
      )}
    </Panel>
  );
}

function Security() {
  const { signOut } = useAuthActions();
  const [error, setError] = useState("");
  return (
    <Panel>
      <Text style={styles.label}>Security</Text>
      <Text style={styles.text}>
        Your account uses email verification codes to sign in.
      </Text>
      <Button
        title="Sign out"
        onPress={() =>
          void signOut().catch(() => setError("Unable to sign out. Try again."))
        }
      />
      {!!error && <Text style={styles.text}>{error}</Text>}
    </Panel>
  );
}

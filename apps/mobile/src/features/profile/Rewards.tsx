import { Text, View, Pressable } from "react-native";
import { useRewards } from "@virel/api-client";
import { formatRewardUsd } from "@virel/shared";
import { Panel, Button } from "@virel/ui-native";
import { styles } from "../../components/Screen";
import { colors } from "@virel/design-tokens";
export function NativeRewards() {
  const rewards = useRewards();
  const { balance, history, busy, error } = rewards;
  if (balance === undefined)
    return <Text style={styles.text}>Loading your rewards…</Text>;
  if (!balance) return null;
  const amount = (value: number | null) =>
    balance.hidden || value === null ? "••••" : formatRewardUsd(value);
  return (
    <Panel>
      <Text style={{ color: colors.primary, fontSize: 11 }}>
        ONLY VISIBLE TO YOU
      </Text>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Text style={[styles.heading, { fontSize: 26 }]}>Your rewards</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: busy, selected: balance.hidden }}
          accessibilityLabel={
            balance.hidden ? "Show reward balance" : "Hide reward balance"
          }
          disabled={busy}
          onPress={() => void rewards.toggleHidden()}
          style={{ padding: 12 }}
        >
          <Text style={{ color: colors.primary }}>
            {balance.hidden ? "Show" : "Hide"}
          </Text>
        </Pressable>
      </View>
      {(
        [
          ["Pending", balance.pendingUsdMicros],
          ["Available", balance.availableUsdMicros],
          ["Total rewards", balance.earnedUsdMicros],
        ] as const
      ).map(([title, value]) => (
        <View
          key={title}
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <Text style={styles.text}>{title}</Text>
          <Text style={styles.label}>{amount(value)}</Text>
        </View>
      ))}
      <Text style={styles.text}>
        {balance.syncing
          ? "Syncing your existing rewards…"
          : "Remix rewards are held pending review. Earnings are separate from generation credits."}
      </Text>
      <Button title="Withdrawals coming later" disabled onPress={() => {}} />
      <Text accessibilityRole="header" style={styles.label}>
        Reward activity
      </Text>
      {history.status === "LoadingFirstPage" ? (
        <Text style={styles.text}>Loading reward activity…</Text>
      ) : !history.results.length ? (
        <Text style={styles.text}>
          When eligible creators remix your videos, your rewards will appear
          here.
        </Text>
      ) : (
        history.results.map((e) => (
          <View
            key={e._id}
            style={{
              paddingVertical: 10,
              borderBottomWidth: 1,
              borderColor: colors.border,
              gap: 6,
            }}
          >
            <Text style={styles.label}>
              {e.kind === "award"
                ? "Remix reward · Pending"
                : e.kind === "release"
                  ? "Reward released"
                  : "Reward reversed"}
            </Text>
            <View
              style={{ flexDirection: "row", justifyContent: "space-between" }}
            >
              <Text style={styles.text}>
                {new Date(e.createdAt).toLocaleDateString()}
              </Text>
              <Text style={styles.label}>{amount(e.usdMicros)}</Text>
            </View>
          </View>
        ))
      )}
      {history.status === "CanLoadMore" && (
        <Button
          title="More reward activity"
          onPress={() => history.loadMore(10)}
        />
      )}
      {!!error && (
        <>
          <Text accessibilityRole="alert" style={styles.text}>
            {error}
          </Text>
          <Button
            title="Retry"
            disabled={busy}
            onPress={() => void rewards.retry()}
          />
        </>
      )}
    </Panel>
  );
}

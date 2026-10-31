import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { BackendProvider } from "@virel/api-client/provider";
import { colors } from "@virel/design-tokens";
import { client, authStorage } from "../src/lib/backend";
function Navigation() {
  return (
    <>
      <StatusBar style="light" />
      <Tabs
        screenOptions={({ route }) => ({
          tabBarIcon: ({ color, size }) => {
            const names: Record<
              string,
              | "home-outline"
              | "compass-outline"
              | "add-circle-outline"
              | "notifications-outline"
              | "person-outline"
            > = {
              index: "home-outline",
              explore: "compass-outline",
              create: "add-circle-outline",
              activity: "notifications-outline",
              profile: "person-outline",
            };
            return (
              <Ionicons
                name={names[route.name] ?? "home-outline"}
                size={size}
                color={typeof color === "string" ? color : colors.muted}
              />
            );
          },
          tabBarInactiveTintColor: colors.muted,
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          tabBarStyle: {
            backgroundColor: colors.background,
            borderTopColor: colors.border,
          },
          tabBarActiveTintColor: colors.primary,
          sceneStyle: { backgroundColor: colors.background },
        })}
      >
        <Tabs.Screen name="index" options={{ title: "Home" }} />
        <Tabs.Screen name="explore" options={{ title: "Explore" }} />
        <Tabs.Screen name="create" options={{ title: "Create" }} />
        <Tabs.Screen name="activity" options={{ title: "Activity" }} />
        <Tabs.Screen name="profile" options={{ title: "Profile" }} />
      </Tabs>
    </>
  );
}
export default function Layout() {
  return client ? (
    <BackendProvider client={client} storage={authStorage}>
      <Navigation />
    </BackendProvider>
  ) : (
    <Navigation />
  );
}

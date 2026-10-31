export const navigation = [
  "Home",
  "Explore",
  "Create",
  "Activity",
  "Profile",
] as const;
export type Destination = (typeof navigation)[number];
export const profileRules = {
  minUsernameLength: 3,
  maxUsernameLength: 24,
  maxBioLength: 160,
} as const;
export function normalizeUsername(value: string): string {
  const username = value.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,24}$/.test(username))
    throw new Error("Use 3–24 letters, numbers, or underscores.");
  return username;
}

export const creationModes = [
  { value: "create", label: "Create" },
  { value: "remix", label: "Remix" },
] as const;
export type CreationMode = (typeof creationModes)[number]["value"];
export const aspectRatios = [
  { value: "9:16", label: "9:16" },
  { value: "16:9", label: "16:9" },
  { value: "1:1", label: "1:1" },
] as const;
export const durations = [
  { value: "5", label: "5 seconds" },
  { value: "10", label: "10 seconds" },
] as const;
export * from "./studio";

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

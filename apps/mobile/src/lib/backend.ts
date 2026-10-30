import * as SecureStore from "expo-secure-store";
import { ConvexReactClient } from "@virel/api-client/provider";
export const backendUrl = process.env.EXPO_PUBLIC_CONVEX_URL;
export const client = backendUrl
  ? new ConvexReactClient(backendUrl, { unsavedChangesWarning: false })
  : null;
// Convex token keys contain punctuation that SecureStore does not allow.
const key = (name: string) =>
  Array.from(name)
    .map((char) => char.charCodeAt(0).toString(16).padStart(4, "0"))
    .join("");
export const authStorage = {
  getItem: (name: string) => SecureStore.getItemAsync(key(name)),
  setItem: (name: string, value: string) =>
    SecureStore.setItemAsync(key(name), value),
  removeItem: (name: string) => SecureStore.deleteItemAsync(key(name)),
};

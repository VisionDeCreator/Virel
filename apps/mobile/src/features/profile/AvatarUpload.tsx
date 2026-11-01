import { useState } from "react";
import { Image, Text } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import {
  api,
  useQuery,
  useMutation,
  useApiAction,
  useApiUrl,
  type Id,
} from "@virel/api-client";
import { Panel, Button } from "@virel/ui-native";
import { styles } from "../../components/Screen";
export function AvatarUpload() {
  const profile = useQuery(api.profiles.me);
  const begin = useApiAction("mediaActions:beginUpload");
  const finish = useApiAction("mediaActions:finishUpload");
  const save = useMutation(api.profiles.setAvatar);
  const apiUrl = useApiUrl();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function upload() {
    setBusy(true);
    try {
      const selected = await DocumentPicker.getDocumentAsync({
        type: ["image/jpeg", "image/png", "image/webp"],
        copyToCacheDirectory: true,
      });
      if (selected.canceled) return;
      const file = selected.assets[0];
      if (!file.mimeType || !file.size || file.size > 10 * 1024 * 1024)
        throw new Error("Choose an image under 10 MB.");
      const result = await begin({
        name: file.name,
        contentType: file.mimeType,
        bytes: file.size,
      });
      const response = await FileSystem.uploadAsync(result.url, file.uri, {
        httpMethod: "PUT",
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: { "Content-Type": file.mimeType },
      });
      if (response.status < 200 || response.status >= 300)
        throw new Error("Upload failed.");
      await finish({ assetId: result.assetId as Id<"mediaAssets"> });
      await save({ assetId: result.assetId as Id<"mediaAssets"> });
      await FileSystem.deleteAsync(file.uri, { idempotent: true });
      setMessage("Profile picture updated. This image is public.");
    } catch {
      setMessage(
        "Unable to update your profile picture. Choose a JPG, PNG, or WebP image under 10 MB and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return profile ? (
    <Panel>
      <Text style={styles.label}>Profile picture</Text>
      {profile.avatarAssetId && (
        <Image
          source={{
            uri: `${apiUrl}/avatars/${profile.username}?v=${profile.avatarVersion ?? 0}`,
          }}
          accessibilityLabel="Your profile picture"
          style={{ width: 100, height: 100, borderRadius: 50 }}
        />
      )}
      <Text style={styles.text}>
        Your profile picture is public. Up to 10 MB.
      </Text>
      <Button
        title={busy ? "Uploading…" : "Choose profile picture"}
        disabled={busy}
        onPress={() => void upload()}
      />
      {!!message && (
        <Text accessibilityLiveRegion="polite" style={styles.text}>
          {message}
        </Text>
      )}
    </Panel>
  ) : null;
}

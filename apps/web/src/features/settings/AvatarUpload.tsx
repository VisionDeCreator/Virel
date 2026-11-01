import { useState } from "react";
import {
  api,
  useMutation,
  useApiAction,
  useApiUrl,
  type Id,
} from "@virel/api-client";
import { Panel, Notice } from "@virel/ui";
export function AvatarUpload({
  username,
  hasAvatar,
  version,
}: {
  username: string;
  hasAvatar: boolean;
  version: number;
}) {
  const begin = useApiAction("mediaActions:beginUpload");
  const finish = useApiAction("mediaActions:finishUpload");
  const save = useMutation(api.profiles.setAvatar);
  const apiUrl = useApiUrl();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function upload(file: File) {
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 10 * 1024 * 1024
    ) {
      setMessage("Choose a JPG, PNG, or WebP image under 10 MB.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const result = await begin({
        name: file.name,
        contentType: file.type,
        bytes: file.size,
      });
      const response = await fetch(result.url, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!response.ok) throw new Error("Image upload failed. Try again.");
      await finish({ assetId: result.assetId as Id<"mediaAssets"> });
      await save({ assetId: result.assetId as Id<"mediaAssets"> });
      setMessage(
        "Profile picture updated. This image is public on your profile.",
      );
    } catch {
      setMessage("Unable to update the picture. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel>
      <h2>Profile picture</h2>
      {hasAvatar && (
        <img
          className="profile-photo"
          src={`${apiUrl}/avatars/${username}?v=${version}`}
          alt="Your profile picture"
        />
      )}
      <label className="field">
        Choose a profile picture
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
            event.target.value = "";
          }}
        />
      </label>
      <p>JPG, PNG, or WebP · up to 10 MB. Your profile picture is public.</p>
      {busy && <Notice>Uploading picture…</Notice>}
      {message && <Notice>{message}</Notice>}
    </Panel>
  );
}

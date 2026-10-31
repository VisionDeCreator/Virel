import { useRef, useState } from "react";
import { Upload, LoaderCircle } from "lucide-react";
import { imageTypes, videoTypes, validateUpload } from "@virel/shared";

export function MediaDropzone({
  kind,
  label,
  description,
  disabled = false,
  uploading = false,
  onFiles,
}: {
  kind: "video" | "image" | "media";
  label: string;
  description: string;
  disabled?: boolean;
  uploading?: boolean;
  onFiles: (files: File[]) => Promise<unknown> | void;
}) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const depth = useRef(0);
  const accepting = useRef(false);
  async function accept(files: File[]) {
    if (disabled || accepting.current || !files.length) return;
    accepting.current = true;
    setError("");
    try {
      const normalized = files.map((file) => {
        const mime =
          file.type.split(";")[0].toLowerCase() ||
          {
            mp4: "video/mp4",
            m4v: "video/mp4",
            mov: "video/quicktime",
            webm: "video/webm",
            png: "image/png",
            jpg: "image/jpeg",
            jpeg: "image/jpeg",
            webp: "image/webp",
          }[file.name.split(".").pop()!.toLowerCase()];
        if (
          !mime ||
          (kind === "image" && !imageTypes.includes(mime)) ||
          (kind === "video" && !videoTypes.includes(mime))
        )
          throw new Error(
            kind === "image"
              ? "Choose a JPG, PNG, or WebP image under 10 MB."
              : "Drop a supported video file in the source video area.",
          );
        validateUpload(mime, file.size);
        return mime === file.type
          ? file
          : new File([file], file.name, {
              type: mime,
              lastModified: file.lastModified,
            });
      });
      if (
        normalized.filter((file) => videoTypes.includes(file.type)).length > 1
      )
        throw new Error("Choose one source video at a time.");
      await onFiles(normalized);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed. Try again.");
    } finally {
      accepting.current = false;
    }
  }
  return (
    <div className="media-upload" aria-busy={uploading}>
      <label
        className={`media-dropzone${dragging && !disabled ? " media-dropzone--dragging" : ""}`}
        aria-disabled={disabled}
        onDragEnter={(event) => {
          if (!Array.from(event.dataTransfer.types).includes("Files")) return;
          event.preventDefault();
          depth.current++;
          if (!disabled) setDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = disabled ? "none" : "copy";
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          depth.current = Math.max(0, depth.current - 1);
          if (!depth.current) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          depth.current = 0;
          setDragging(false);
          void accept(Array.from(event.dataTransfer.files));
        }}
      >
        {uploading ? (
          <LoaderCircle
            size={24}
            className="media-upload-icon--busy"
            aria-hidden="true"
          />
        ) : (
          <Upload size={24} aria-hidden="true" />
        )}
        <strong>{label}</strong>
        <span>
          {uploading
            ? "Upload in progress…"
            : dragging && !disabled
              ? "Drop to upload"
              : "Drag & drop or click to browse"}
        </span>
        <small>{description}</small>
        <input
          aria-label={label}
          type="file"
          multiple={kind !== "video"}
          accept={(kind === "image"
            ? imageTypes
            : kind === "video"
              ? videoTypes
              : [...videoTypes, ...imageTypes]
          ).join(",")}
          disabled={disabled}
          onChange={(event) => {
            void accept(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />
      </label>
      {error && (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

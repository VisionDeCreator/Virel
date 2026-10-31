import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
const env = process.env;
import { ALL_FORMATS, Input, UrlSource } from "mediabunny";
export function storage() {
  const endpoint =
    env.R2_ENDPOINT?.trim() ||
    (env.R2_ACCOUNT_ID
      ? `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
      : "");
  const bucket = env.R2_BUCKET?.trim() || env.R2_BUCKET_NAME?.trim();
  if (
    !endpoint ||
    !bucket ||
    !env.R2_ACCESS_KEY_ID ||
    !env.R2_SECRET_ACCESS_KEY
  )
    throw new Error("R2 storage is not configured.");
  const parsed = new URL(endpoint);
  const account = env.R2_ACCOUNT_ID?.trim();
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname !== "/" ||
    !/^[a-f0-9]{32}(?:\.(?:eu|us|fedramp))?\.r2\.cloudflarestorage\.com$/i.test(
      parsed.hostname,
    ) ||
    (account && !parsed.hostname.startsWith(`${account}.`))
  )
    throw new Error("R2 endpoint must be the account's HTTPS R2 S3 endpoint.");
  return {
    bucket,
    client: new S3Client({
      region: "auto",
      endpoint: parsed.origin,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID.trim(),
        secretAccessKey: env.R2_SECRET_ACCESS_KEY.trim(),
      },
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    }),
  };
}
export async function readUrl(
  key: string,
  downloadName?: string,
  expiresIn = 3600,
) {
  const { client, bucket } = storage();
  const safeName = downloadName?.replace(/[^a-zA-Z0-9._-]/g, "_");
  return await getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ...(safeName
        ? { ResponseContentDisposition: `attachment; filename="${safeName}"` }
        : {}),
    }),
    { expiresIn },
  );
}
export async function uploadUrl(key: string, type: string, bytes: number) {
  const { client, bucket } = storage();
  // Exact length is signed. A verified upload is copied to an immutable key before use.
  return await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: type,
      ContentLength: bytes,
    }),
    { expiresIn: 900 },
  );
}
export async function inspectVideo(
  key: string,
  minDuration = 4,
  maxDuration = 15,
) {
  const url = await readUrl(key);
  const input = new Input({ source: new UrlSource(url), formats: ALL_FORMATS });
  const timer = setTimeout(() => input.dispose(), 60000);
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track || track.codec !== "avc")
      throw new Error(
        "Use an H.264 MP4 video for reliable playback on all devices.",
      );
    const duration = await input.computeDuration();
    if (
      !Number.isFinite(duration) ||
      duration < minDuration ||
      duration > maxDuration
    )
      throw new Error(
        `Choose a video between ${minDuration} and ${maxDuration} seconds.`,
      );
    if (
      track.displayWidth < 64 ||
      track.displayHeight < 64 ||
      track.displayWidth > 4096 ||
      track.displayHeight > 4096
    )
      throw new Error("Use video dimensions between 64 and 4,096 pixels.");
    return { duration, width: track.displayWidth, height: track.displayHeight };
  } finally {
    clearTimeout(timer);
    input.dispose();
  }
}
export {
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
  Upload,
};

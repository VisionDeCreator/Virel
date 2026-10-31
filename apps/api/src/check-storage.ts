import { loadRootEnvironment } from "./runtime/env";
import {
  storage,
  uploadUrl,
  readUrl,
  DeleteObjectCommand,
  CopyObjectCommand,
  HeadObjectCommand,
} from "./services/r2";
loadRootEnvironment();
const { client, bucket } = storage();
const key = `private/studio-check/${crypto.randomUUID()}`;
const sealed = `${key}-sealed`;
const bytes = new TextEncoder().encode("Virel private storage smoke test");
const cleanup = new Set<string>();
let phase = "signed upload";
try {
  cleanup.add(key);
  const put = await fetch(
    await uploadUrl(key, "application/octet-stream", bytes.byteLength),
    {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: bytes,
    },
  );
  if (!put.ok) {
    cleanup.delete(key);
    const body = await put.text();
    const code = body.match(/<Code>([A-Za-z]+)<\/Code>/)?.[1];
    console.error(
      `Signed upload HTTP status: ${put.status}; R2 code: ${code && ["AccessDenied", "SignatureDoesNotMatch", "InvalidAccessKeyId", "Unauthorized", "InvalidArgument"].includes(code) ? code : "unavailable"}.`,
    );
    throw new Error("Signed upload rejected.");
  }
  phase = "object metadata";
  const head = await client.send(
    new HeadObjectCommand({ Bucket: bucket, Key: key }),
  );
  if (head.ContentLength !== bytes.byteLength)
    throw new Error("Stored size did not match.");
  phase = "immutable copy";
  cleanup.add(sealed);
  await client.send(
    new CopyObjectCommand({
      Bucket: bucket,
      Key: sealed,
      CopySource: `${bucket}/${key}`,
      CopySourceIfMatch: head.ETag,
    }),
  );
  phase = "signed range read";
  const get = await fetch(await readUrl(sealed), {
    headers: { Range: "bytes=0-4" },
  });
  if (get.status !== 206 || (await get.text()) !== "Virel")
    throw new Error("Signed range read failed.");
  console.log(
    "Private R2 signed upload, immutable copy, and range read passed.",
  );
  phase = "browser CORS";
  for (const origin of (
    process.env.STUDIO_WEB_ORIGINS ?? "http://localhost:5173"
  )
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)) {
    const preflight = await fetch(
      await uploadUrl(key, "application/octet-stream", bytes.byteLength),
      {
        method: "OPTIONS",
        headers: {
          Origin: origin,
          "Access-Control-Request-Method": "PUT",
          "Access-Control-Request-Headers": "content-type",
        },
      },
    );
    const allowed = preflight.headers.get("Access-Control-Allow-Origin");
    if (!preflight.ok || (allowed !== origin && allowed !== "*"))
      throw new Error("R2 CORS did not permit a configured Studio origin.");
  }
  console.log("Configured Studio browser origins passed R2 CORS checks.");
} catch (error) {
  const status = (error as { $metadata?: { httpStatusCode?: number } })
    .$metadata?.httpStatusCode;
  const kind = error instanceof Error ? error.name : "Unknown";
  console.error(
    `Failed phase: ${phase}; category: ${kind}; status: ${status ?? "unavailable"}.`,
  );
  process.exitCode = 1;
  console.error(
    "R2 smoke check failed. Verify API/worker storage credentials, bucket permissions, and existing CORS configuration. No values were logged.",
  );
} finally {
  for (const name of cleanup) {
    try {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: name }));
    } catch (error) {
      process.exitCode = 1;
      console.error(
        `Temporary object cleanup failed: ${(error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode ?? "network/configuration"}.`,
      );
    }
  }
}

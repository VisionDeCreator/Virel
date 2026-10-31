import { resolve } from "node:path";
const root = resolve(import.meta.dir, "..");
const source = Bun.file(resolve(root, "packages/backend/.env.local"));
if (!(await source.exists()))
  throw new Error("Configure the intended Virel Convex deployment first.");
const entries = new Map(
  (await source.text())
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.trim().startsWith("#"))
    .map((line) => {
      const at = line.indexOf("=");
      return [
        line.slice(0, at).trim(),
        line
          .slice(at + 1)
          .split(" #")[0]
          .trim()
          .replace(/^['"]|['"]$/g, ""),
      ];
    }),
);
const url = entries.get("CONVEX_URL") ?? entries.get("VITE_CONVEX_URL");
if (!url || !/^https:\/\/[a-z0-9-]+\.convex\.cloud$/.test(url))
  throw new Error(
    "Expected a Convex cloud development URL. Local deployments require device-accessible host configuration.",
  );
for (const [path, key] of [
  ["apps/web/.env.local", "VITE_CONVEX_URL"],
  ["apps/mobile/.env", "EXPO_PUBLIC_CONVEX_URL"],
  ["apps/api/.env", "CONVEX_URL"],
]) {
  const target = resolve(root, path);
  const file = Bun.file(target);
  const current = (await file.exists()) ? await file.text() : "";
  const lines = current
    .split(/\r?\n/)
    .filter((line) => !line.startsWith(`${key}=`));
  await Bun.write(
    target,
    `${lines.filter(Boolean).join("\n")}${lines.some(Boolean) ? "\n" : ""}${key}=${url}\n`,
  );
  console.log(`Configured ${path}: ${key}`);
}
console.log(
  "Client URLs configured. Restart running clients. Auth keys and backend deployment are managed separately.",
);

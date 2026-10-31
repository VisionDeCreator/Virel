import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";
export function loadRootEnvironment() {
  try {
    const values = parseEnv(
      readFileSync(
        fileURLToPath(new URL("../../../../.env", import.meta.url)),
        "utf8",
      ),
    );
    for (const [key, value] of Object.entries(values))
      if (process.env[key] === undefined) process.env[key] = value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

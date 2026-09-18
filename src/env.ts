import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Load KEY=value from a .env file into process.env without overriding existing values. */
export function loadDotenv(cwd = process.cwd(), filename = ".env"): void {
  const path = join(cwd, filename);
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    const current = process.env[key];
    if (current === undefined || current === "") {
      process.env[key] = val;
    }
  }
}

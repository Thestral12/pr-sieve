import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadDotenv } from "../src/env.js";

const KEY = "SIEVE_DOTENV_TEST_KEY";

afterEach(() => {
  delete process.env[KEY];
});

describe("loadDotenv", () => {
  it("sets missing keys and does not override existing ones", () => {
    const dir = mkdtempSync(join(tmpdir(), "sieve-env-"));
    writeFileSync(join(dir, ".env"), `${KEY}=from-file\n`, "utf8");
    loadDotenv(dir);
    expect(process.env[KEY]).toBe("from-file");
    process.env[KEY] = "already";
    writeFileSync(join(dir, ".env"), `${KEY}=ignored\n`, "utf8");
    loadDotenv(dir);
    expect(process.env[KEY]).toBe("already");
  });
});

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assembleDossier, dossierFromGit, isLockfile, truncateHunk } from "../src/dossier.js";
import { runGit } from "../src/git.js";
import { defaultPolicy } from "../src/policy/load.js";
import { redactSecrets } from "../src/redact.js";

describe("dossier", () => {
  it("redacts secret-shaped substrings", () => {
    const text = redactSecrets('key=AKIA0000000000000000 TYPESAFE_API_KEY=abc ghp_abcdefghijklmnopqrstuvwxyz0123456789');
    expect(text).not.toMatch(/AKIA0000000000000000/);
    expect(text).not.toMatch(/TYPESAFE_API_KEY=abc/);
    expect(text).toContain("[REDACTED]");
  });

  it("prefers added lines when truncating a hunk", () => {
    const hunk = [
      "diff --git a/a.ts b/a.ts",
      "--- a/a.ts",
      "+++ b/a.ts",
      "@@ -1,3 +1,3 @@",
      "-old",
      " context",
      "+" + "n".repeat(80),
    ].join("\n");
    const cut = truncateHunk(hunk, 60);
    expect(cut.truncated).toBe(true);
    expect(cut.text).toContain("+");
    expect(cut.text.length).toBeLessThanOrEqual(60);
  });

  it("drops ignored and lockfile hunks but keeps the path list", () => {
    const policy = defaultPolicy();
    const dossier = assembleDossier({
      title: "chore",
      body: "AKIA0000000000000000 in a body",
      policy,
      files: [
        { path: "pnpm-lock.yaml", status: "M", additions: 10, deletions: 1, lockfile: true },
        { path: "src/app.ts", status: "M", additions: 2, deletions: 0 },
        { path: "dist/index.js", status: "M", additions: 5, deletions: 0 },
      ],
      hunks: [
        { path: "pnpm-lock.yaml", hunk: "diff --git a/pnpm-lock.yaml b/pnpm-lock.yaml\n+secret" },
        { path: "src/app.ts", hunk: "diff --git a/src/app.ts b/src/app.ts\n+hello" },
        { path: "dist/index.js", hunk: "diff --git a/dist/index.js b/dist/index.js\n+nope" },
      ],
    });
    expect(dossier.files.map((f) => f.path)).toEqual(["src/app.ts"]);
    expect(dossier.diff).toContain("src/app.ts");
    expect(dossier.diff).not.toContain("nope");
    expect(dossier.body).toContain("[REDACTED]");
    expect(isLockfile("Cargo.lock")).toBe(true);
  });

  it("records regex hits from the unredacted hunk", () => {
    const policy = defaultPolicy();
    const dossier = assembleDossier({
      title: "x",
      body: "",
      policy,
      files: [{ path: "src/config.ts", status: "M", additions: 1, deletions: 0 }],
      hunks: [
        {
          path: "src/config.ts",
          hunk: 'diff --git a/src/config.ts b/src/config.ts\n+const k = "AKIA0000000000000000";\n',
        },
      ],
    });
    expect(dossier.preflight.secret_regex_hits.length).toBeGreaterThan(0);
    expect(dossier.diff).not.toMatch(/AKIA0000000000000000/);
  });

  it("builds a dossier from a real git diff", () => {
    const dir = mkdtempSync(join(tmpdir(), "sieve-git-"));
    const git = (args: string[]) => {
      const r = runGit(args, dir);
      if (r.status !== 0) throw new Error(r.stderr);
    };
    git(["init"]);
    git(["config", "user.email", "sieve@example.test"]);
    git(["config", "user.name", "sieve"]);
    git(["config", "commit.gpgsign", "false"]);
    writeFileSync(join(dir, "app.ts"), "export const a = 1;\n");
    git(["add", "."]);
    git(["commit", "-m", "base"]);
    const base = runGit(["rev-parse", "HEAD"], dir).stdout.trim();
    writeFileSync(join(dir, "app.ts"), "export const a = 2;\n");
    git(["add", "."]);
    git(["commit", "-m", "head"]);
    const head = runGit(["rev-parse", "HEAD"], dir).stdout.trim();
    const d = dossierFromGit({
      cwd: dir,
      base,
      head,
      policy: defaultPolicy(),
      title: "change",
    });
    expect(d.files.some((f) => f.path.endsWith("app.ts"))).toBe(true);
    expect(d.diff).toContain("+export const a = 2");
  });
});

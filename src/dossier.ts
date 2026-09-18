import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { anyPathMatches, matchesAny, normalizePath } from "./glob.js";
import { gitOk, runGit } from "./git.js";
import { findSecretHits, redactSecrets } from "./redact.js";
import type { Dossier, DossierFile, LoadedPolicy, SecretHit } from "./types.js";
import { BODY_LIMIT, PER_FILE_HUNK, TOTAL_DIFF_CHARS } from "./types.js";

export const LOCKFILE_NAMES = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  "Cargo.lock",
  "go.sum",
  "poetry.lock",
  "composer.lock",
  "Gemfile.lock",
]);

const TAG_GLOBS: { tag: string; globs: string[] }[] = [
  { tag: "auth", globs: ["**/auth/**", "**/*auth*.*", "**/middleware/**"] },
  { tag: "ci", globs: [".github/**", "**/.gitlab-ci*", "**/Jenkinsfile"] },
  { tag: "docs", globs: ["**/*.md", "docs/**"] },
];

function basename(p: string): string {
  const n = normalizePath(p);
  const i = n.lastIndexOf("/");
  return i >= 0 ? n.slice(i + 1) : n;
}

export function isLockfile(path: string): boolean {
  return LOCKFILE_NAMES.has(basename(path));
}

export function truncateHunk(hunk: string, max: number): { text: string; truncated: boolean } {
  if (hunk.length <= max) return { text: hunk, truncated: false };
  const lines = hunk.split("\n");
  const preferred = lines.filter(
    (line) =>
      line.startsWith("diff ") ||
      line.startsWith("index ") ||
      line.startsWith("---") ||
      line.startsWith("+++") ||
      line.startsWith("@@") ||
      line.startsWith("+"),
  );
  let text = preferred.join("\n");
  if (text.length <= max) return { text, truncated: true };
  return { text: text.slice(0, max), truncated: true };
}

export function splitDiff(unified: string): { path: string; hunk: string }[] {
  if (!unified.trim()) return [];
  const parts = unified.split(/^diff --git /m);
  const out: { path: string; hunk: string }[] = [];
  for (const part of parts) {
    if (!part.trim()) continue;
    const hunk = part.startsWith("diff --git ") ? part : `diff --git ${part}`;
    const plus = hunk.match(/^\+\+\+ b\/(.+)$/m);
    const gitLine = hunk.match(/^diff --git a\/(.+?) b\/(.+)$/m);
    const path = plus?.[1] ?? gitLine?.[2] ?? gitLine?.[1];
    if (!path || path === "/dev/null") continue;
    out.push({ path: normalizePath(path), hunk });
  }
  return out;
}

function parseNameStatus(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cols = line.split("\t");
    const status = cols[0] ?? "M";
    const path = cols[cols.length - 1];
    if (path) map.set(normalizePath(path), status[0] ?? "M");
  }
  return map;
}

function parseNumstat(text: string): Map<string, { additions: number; deletions: number; binary: boolean }> {
  const map = new Map<string, { additions: number; deletions: number; binary: boolean }>();
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cols = line.split("\t");
    if (cols.length < 3) continue;
    const [addRaw, delRaw, pathRaw] = cols;
    const path = normalizePath((pathRaw ?? "").split(" => ").pop() ?? "");
    if (!path) continue;
    const binary = addRaw === "-" && delRaw === "-";
    map.set(path, {
      additions: binary ? 0 : Number(addRaw) || 0,
      deletions: binary ? 0 : Number(delRaw) || 0,
      binary,
    });
  }
  return map;
}

export function pathTags(paths: readonly string[], policy: LoadedPolicy): string[] {
  const tags = new Set<string>();
  for (const { tag, globs } of TAG_GLOBS) {
    if (anyPathMatches(paths, globs)) tags.add(tag);
  }
  if (anyPathMatches(paths, policy.preflight.test_path_globs)) tags.add("tests");
  if (anyPathMatches(paths, policy.preflight.changelog_paths)) tags.add("changelog");
  for (const rule of policy.rules) {
    if (rule.paths && anyPathMatches(paths, rule.paths)) {
      tags.add(rule.id);
    }
  }
  return [...tags].sort();
}

export function assembleDossier(input: {
  title: string;
  body: string;
  author_association?: string;
  files: DossierFile[];
  hunks: { path: string; hunk: string }[];
  policy: LoadedPolicy;
}): Dossier {
  const { policy } = input;
  const maxTotal = policy.preflight.max_diff_chars || TOTAL_DIFF_CHARS;
  const maxFile = PER_FILE_HUNK;

  const files = input.files.filter((f) => !matchesAny(f.path, policy.ignore_paths));
  const includeLockfiles = policy.rules.some((r) => r.include_lockfiles);

  const secretHits: SecretHit[] = [];
  const diffParts: string[] = [];
  let truncated = files.length > policy.preflight.max_files;
  let used = 0;

  const limitedFiles = files.slice(0, policy.preflight.max_files);
  const hunkByPath = new Map(input.hunks.map((h) => [normalizePath(h.path), h.hunk]));

  for (const file of limitedFiles) {
    const rawHunk = hunkByPath.get(normalizePath(file.path)) ?? "";
    const redacted = redactSecrets(rawHunk);
    secretHits.push(
      ...findSecretHits(file.path, rawHunk, policy.preflight.secret_regexes),
    );

    const skipHunk =
      file.binary ||
      (file.lockfile && !includeLockfiles) ||
      !redacted.trim();
    if (skipHunk) continue;

    const cut = truncateHunk(redacted, maxFile);
    if (cut.truncated) truncated = true;
    const remaining = maxTotal - used;
    if (remaining <= 0) {
      truncated = true;
      continue;
    }
    const piece = cut.text.length > remaining ? cut.text.slice(0, remaining) : cut.text;
    if (piece.length < cut.text.length) truncated = true;
    diffParts.push(piece);
    used += piece.length + 1;
  }

  if (files.length > limitedFiles.length) truncated = true;

  const paths = files.map((f) => f.path);
  const body = redactSecrets(input.body).slice(0, BODY_LIMIT);

  return {
    surface: "pr",
    title: redactSecrets(input.title),
    body,
    author_association: input.author_association ?? "NONE",
    files,
    path_tags: pathTags(paths, policy),
    preflight: {
      secret_regex_hits: secretHits,
      has_test_file_change: anyPathMatches(paths, policy.preflight.test_path_globs),
      has_changelog_change: anyPathMatches(paths, policy.preflight.changelog_paths),
      file_count: files.length,
      truncated,
    },
    diff: diffParts.join("\n"),
  };
}

export function dossierFromGit(opts: {
  cwd: string;
  base: string;
  head: string;
  policy: LoadedPolicy;
  title?: string;
  body?: string;
  author_association?: string;
}): Dossier {
  const { cwd, base, head, policy } = opts;
  const range = `${base}...${head}`;
  const nameStatus = parseNameStatus(gitOk(["diff", "--name-status", "--find-renames", range], cwd));
  const numstat = parseNumstat(gitOk(["diff", "--numstat", "--find-renames", range], cwd));
  const unified = gitOk(["diff", "--unified=3", "--find-renames", range], cwd);
  const hunks = splitDiff(unified);

  const paths = new Set([...nameStatus.keys(), ...numstat.keys(), ...hunks.map((h) => h.path)]);
  const files: DossierFile[] = [...paths].sort().map((path) => {
    const ns = numstat.get(path);
    return {
      path,
      status: nameStatus.get(path) ?? "M",
      additions: ns?.additions ?? 0,
      deletions: ns?.deletions ?? 0,
      binary: ns?.binary ?? false,
      lockfile: isLockfile(path),
    };
  });

  return assembleDossier({
    title: opts.title ?? `diff ${range}`,
    body: opts.body ?? "",
    author_association: opts.author_association,
    files,
    hunks,
    policy,
  });
}

export function writeDossierFile(dossier: Dossier, dir?: string): string {
  const folder = dir ?? process.env.RUNNER_TEMP ?? tmpdir();
  const path = join(folder, `pr-sieve-dossier-${Date.now()}.json`);
  writeFileSync(path, JSON.stringify(dossier, null, 2), "utf8");
  return path;
}

export function gitRevParse(ref: string, cwd: string): string | undefined {
  const result = runGit(["rev-parse", "--short", ref], cwd);
  if (result.status !== 0) return undefined;
  return result.stdout.trim();
}

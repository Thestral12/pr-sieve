import micromatch from "micromatch";

export function normalizePath(p: string): string {
  return p.replace(/\\/g, "/");
}

export function matchesAny(filePath: string, globs: readonly string[] | undefined): boolean {
  if (!globs || globs.length === 0) return false;
  const p = normalizePath(filePath);
  return micromatch.isMatch(p, [...globs], { dot: true });
}

export function anyPathMatches(paths: readonly string[], globs: readonly string[] | undefined): boolean {
  if (!globs || globs.length === 0) return false;
  return paths.some((p) => matchesAny(p, globs));
}

export function everyPathMatches(paths: readonly string[], globs: readonly string[]): boolean {
  if (paths.length === 0) return false;
  return paths.every((p) => matchesAny(p, globs));
}

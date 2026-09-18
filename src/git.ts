import { spawnSync } from "node:child_process";

export function runGit(args: readonly string[], cwd: string): {
  stdout: string;
  stderr: string;
  status: number;
} {
  const result = spawnSync("git", [...args], {
    cwd,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status ?? 1,
  };
}

export function gitOk(args: readonly string[], cwd: string): string {
  const result = runGit(args, cwd);
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim() || result.stdout.trim()}`);
  }
  return result.stdout;
}

export function gitShow(ref: string, filePath: string, cwd: string): string | undefined {
  const spec = `${ref}:${filePath.replace(/\\/g, "/")}`;
  const result = runGit(["show", spec], cwd);
  if (result.status !== 0) return undefined;
  return result.stdout;
}

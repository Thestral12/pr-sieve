import type { EngineResult, LoadedPolicy } from "./types.js";
import { COMMENT_MARKER } from "./types.js";

export function statusLine(opts: {
  kind: "ok" | "degraded" | "fork-skip" | "config-error" | "setup-error";
  fails: boolean;
  findingsFailCount: number;
  error?: string;
}): string {
  if (opts.kind === "degraded") return "sieve degraded";
  if (opts.kind === "fork-skip") return "sieve skipped: no key on fork PR";
  if (opts.kind === "config-error") return `invalid config${opts.error ? `: ${opts.error}` : ""}`;
  if (opts.kind === "setup-error") return opts.error ?? "sieve setup failure";
  if (opts.fails) {
    const n = opts.findingsFailCount;
    return n === 1 ? "1 failing gate" : `${n} failing gates`;
  }
  return "clean";
}

export function renderComment(opts: {
  status: string;
  engine?: EngineResult;
  policy?: LoadedPolicy;
  model?: string;
  ms?: number;
  truncated?: boolean;
}): string {
  const lines: string[] = [COMMENT_MARKER, "## pr-sieve", "", opts.status, ""];

  if (opts.engine && opts.engine.rows.length > 0) {
    lines.push("| Rule | Answer | Gate | Action |", "|---|---|---|---|");
    for (const row of opts.engine.rows) {
      lines.push(`| \`${row.id}\` | ${row.answer} | ${row.gate} | ${row.action} |`);
    }
    lines.push("");
  }

  const policyLabel = opts.policy
    ? `\`${opts.policy.path}\`${opts.policy.sha ? ` @ \`${opts.policy.sha.slice(0, 7)}\`` : ""} · source ${opts.policy.source}`
    : "default pack";
  const model = opts.model ?? "—";
  const ms = opts.ms !== undefined ? `${Math.round(opts.ms)}ms` : "—";
  const truncated = `truncated_diff=${opts.truncated === true}`;
  lines.push(`Policy: ${policyLabel} · model \`${model}\` · ${ms} · ${truncated}`);
  return lines.join("\n") + "\n";
}

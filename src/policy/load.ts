import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { gitShow } from "../git.js";
import type { LoadedPolicy, PolicySource } from "../types.js";
import { formatZodError, jevConfigSchema, mergeConfig } from "./schema.js";

export type PolicyLoadResult =
  | { ok: true; policy: LoadedPolicy }
  | { ok: false; message: string };

export function parsePolicyText(
  text: string,
  meta: { source: PolicySource; path: string; sha?: string },
): PolicyLoadResult {
  let raw: unknown;
  try {
    raw = parseYaml(text) ?? {};
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `YAML parse error in ${meta.path}: ${message}` };
  }

  const parsed = jevConfigSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: `Invalid ${meta.path}: ${formatZodError(parsed.error as z.ZodError)}`,
    };
  }

  const policy = mergeConfig(parsed.data);
  return {
    ok: true,
    policy: {
      ...policy,
      source: meta.source,
      path: meta.path,
      sha: meta.sha,
      warnings: [],
    },
  };
}

export function defaultPolicy(): LoadedPolicy {
  const merged = mergeConfig({ version: 1 });
  return {
    ...merged,
    source: "default",
    path: "(default pack)",
    warnings: ["policy defaulted: no .jev.yml on base or head"],
  };
}

export function loadPolicy(opts: {
  cwd: string;
  configPath: string;
  baseSha?: string;
  fromFile?: boolean;
}): PolicyLoadResult {
  const { cwd, configPath, baseSha, fromFile } = opts;

  if (baseSha) {
    const shown = gitShow(baseSha, configPath, cwd);
    if (shown !== undefined) {
      return parsePolicyText(shown, { source: "base", path: configPath, sha: baseSha });
    }
  }

  if (fromFile !== false) {
    try {
      const text = readFileSync(configPath, "utf8");
      const result = parsePolicyText(text, {
        source: baseSha ? "head" : "head",
        path: configPath,
        sha: undefined,
      });
      if (result.ok && baseSha) {
        result.policy.warnings.push("policy_source: head (missing on base)");
      }
      return result;
    } catch {
      // fall through to default
    }
  }

  return { ok: true, policy: defaultPolicy() };
}

import { z } from "zod";
import type { Policy, PreflightConfig, Rule } from "../types.js";
import { DEFAULT_SECRET_REGEXES } from "../redact.js";
import { builtinRuleDefaults } from "../packs/pr.v1.js";

const gateOn = z.enum(["fail", "comment", "ignore"]);
const ruleType = z.enum(["noul", "choice", "score"]);

const builtinOverlay = z
  .object({
    on: gateOn.optional(),
    threshold: z.number().min(0).max(1).optional(),
    paths: z.array(z.string()).optional(),
    not_paths: z.array(z.string()).optional(),
    ask: z.string().optional(),
    title_matches: z.string().optional(),
    type: ruleType.optional(),
    options: z.record(z.string()).optional(),
    levels: z.array(z.string()).optional(),
    include_lockfiles: z.boolean().optional(),
    criteria: z
      .object({
        true: z.string().optional(),
        false: z.string().optional(),
      })
      .optional(),
  })
  .passthrough();

const userRule = z
  .object({
    id: z.string().min(1),
    on: gateOn,
    threshold: z.number(),
    ask: z.string().min(1),
    paths: z.array(z.string()).optional(),
    not_paths: z.array(z.string()).optional(),
    title_matches: z.string().optional(),
    type: ruleType.optional(),
    options: z.record(z.string()).optional(),
    levels: z.array(z.string()).optional(),
    include_lockfiles: z.boolean().optional(),
    criteria: z
      .object({
        true: z.string().optional(),
        false: z.string().optional(),
      })
      .optional(),
  })
  .passthrough();

const preflightSchema = z
  .object({
    max_files: z.number().int().positive().optional(),
    max_diff_chars: z.number().int().positive().optional(),
    secret_regexes: z.array(z.string()).optional(),
    test_path_globs: z.array(z.string()).optional(),
    changelog_paths: z.array(z.string()).optional(),
  })
  .passthrough();

export const jevConfigSchema = z
  .object({
    version: z.literal(1).optional().default(1),
    ignore_paths: z.array(z.string()).optional(),
    preflight: preflightSchema.optional(),
    builtin: z.record(builtinOverlay).optional(),
    rules: z.array(userRule).optional(),
  })
  .passthrough();

export type ParsedJevConfig = z.infer<typeof jevConfigSchema>;

export const DEFAULT_IGNORE_PATHS = ["pnpm-lock.yaml", "**/*.snap", "dist/**"];

export const DEFAULT_PREFLIGHT: PreflightConfig = {
  max_files: 80,
  max_diff_chars: 12000,
  secret_regexes: [...DEFAULT_SECRET_REGEXES],
  test_path_globs: ["**/*.{test,spec}.*", "**/__tests__/**"],
  changelog_paths: ["CHANGELOG.md", "changelog.md"],
};

export function defaultRules(): Rule[] {
  return builtinRuleDefaults();
}

export function mergeConfig(parsed: ParsedJevConfig): Policy {
  const rulesById = new Map<string, Rule>();
  for (const rule of defaultRules()) {
    rulesById.set(rule.id, { ...rule });
  }

  if (parsed.builtin) {
    for (const [id, overlay] of Object.entries(parsed.builtin)) {
      const base = rulesById.get(id) ?? {
        id,
        on: "comment" as const,
        threshold: 0.75,
        ask: overlay.ask ?? id,
        type: overlay.type ?? "noul",
      };
      rulesById.set(id, {
        ...base,
        ...overlay,
        id,
        on: overlay.on ?? base.on,
        threshold: overlay.threshold ?? base.threshold,
        ask: overlay.ask ?? base.ask,
        type: overlay.type ?? base.type,
      });
    }
  }

  if (parsed.rules) {
    for (const raw of parsed.rules) {
      const existing = rulesById.get(raw.id);
      rulesById.set(raw.id, {
        id: raw.id,
        on: raw.on,
        threshold: raw.threshold,
        ask: raw.ask,
        paths: raw.paths ?? existing?.paths,
        not_paths: raw.not_paths ?? existing?.not_paths,
        title_matches: raw.title_matches ?? existing?.title_matches,
        type: raw.type ?? existing?.type ?? "noul",
        options: raw.options ?? existing?.options,
        levels: raw.levels ?? existing?.levels,
        include_lockfiles: raw.include_lockfiles ?? existing?.include_lockfiles,
        criteria: raw.criteria ?? existing?.criteria,
      });
    }
  }

  const preflight: PreflightConfig = {
    ...DEFAULT_PREFLIGHT,
    ...parsed.preflight,
    secret_regexes: parsed.preflight?.secret_regexes ?? DEFAULT_PREFLIGHT.secret_regexes,
    test_path_globs: parsed.preflight?.test_path_globs ?? DEFAULT_PREFLIGHT.test_path_globs,
    changelog_paths: parsed.preflight?.changelog_paths ?? DEFAULT_PREFLIGHT.changelog_paths,
  };

  return {
    version: 1,
    ignore_paths: parsed.ignore_paths ?? [...DEFAULT_IGNORE_PATHS],
    preflight,
    rules: [...rulesById.values()],
  };
}

export function formatZodError(err: z.ZodError): string {
  return err.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

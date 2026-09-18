import { choice, noul, score } from "@typesafe-ai/sdk";
import type { Questions } from "@typesafe-ai/sdk";
import type { Rule } from "../types.js";
import { MIXED_CONFIDENCE } from "../types.js";

export const BUILTIN_IDS = [
  "looks_like_secret",
  "missing_tests",
  "changelog",
  "touches_auth",
  "change_kind",
] as const;

export function builtinRuleDefaults(): Rule[] {
  return [
    {
      id: "looks_like_secret",
      on: "fail",
      threshold: 0.85,
      type: "noul",
      ask: "This change introduces or exposes a live credential, private key, or access token — not a placeholder or example.",
    },
    {
      id: "missing_tests",
      on: "fail",
      threshold: 0.80,
      type: "noul",
      ask: "A feature or bugfix in this PR needed tests and does not have them.",
      criteria: {
        true: "Title or body is a feature or fix, a non-test source file changed, and preflight.has_test_file_change is false. A small new function still counts.",
        false: "A test file is in the changed-file list, or the PR is docs/ci/chore/lockfile/vendor-only.",
      },
    },
    {
      id: "changelog",
      on: "comment",
      threshold: 0.70,
      type: "noul",
      ask: "This is a user-facing or API-facing change that should be recorded in the changelog, preflight.has_changelog_change is false, and the changelog was not updated.",
    },
    {
      id: "touches_auth",
      on: "comment",
      threshold: 0.75,
      type: "noul",
      paths: ["**/auth/**", "**/*auth*.*", "**/middleware/**"],
      ask: "This change affects authentication, authorization, session handling, or access control — including middleware and permission checks.",
    },
    {
      id: "change_kind",
      on: "comment",
      threshold: MIXED_CONFIDENCE,
      type: "choice",
      ask: "What is the primary nature of this PR?",
      options: {
        feature: "Adds user-visible or API behavior.",
        fix: "Corrects existing behavior.",
        refactor: "Restructures code without intending behavior change.",
        chore: "Deps, CI, docs-only, formatting.",
        mixed: "More than one of the above in a way that should be split.",
      },
    },
  ];
}

export function ruleToQuestion(rule: Rule): Questions[string] {
  if (rule.type === "choice") {
    const options = rule.options ?? { other: "None of the named options." };
    return choice(rule.ask, options);
  }
  if (rule.type === "score") {
    const levels = rule.levels ?? ["low", "high"];
    return score(rule.ask, levels as [string, string, ...string[]]);
  }
  return noul(rule.ask, rule.criteria);
}

export function questionsFromRules(rules: readonly Rule[]): Questions {
  const questions: Questions = {};
  for (const rule of rules) {
    questions[rule.id] = ruleToQuestion(rule);
  }
  return questions;
}

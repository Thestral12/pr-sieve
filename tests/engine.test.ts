import { describe, expect, it } from "vitest";
import { runEngine } from "../src/engine.js";
import { planQuestions } from "../src/plan.js";
import { defaultPolicy } from "../src/policy/load.js";
import type { Answers, Dossier, Rule } from "../src/types.js";

function dossier(over: Partial<Dossier> = {}): Dossier {
  const base: Dossier = {
    surface: "pr",
    title: "feat: x",
    body: "",
    author_association: "MEMBER",
    files: [{ path: "src/app.ts", status: "M", additions: 4, deletions: 0 }],
    path_tags: [],
    preflight: {
      secret_regex_hits: [],
      has_test_file_change: false,
      has_changelog_change: false,
      file_count: 1,
      truncated: false,
    },
    diff: "+x",
  };
  return {
    ...base,
    ...over,
    preflight: {
      ...base.preflight,
      ...over.preflight,
    },
  };
}

function run(opts: {
  answers?: Answers;
  dossier?: Dossier;
  failOn?: "gate" | "never" | "any-finding";
  asked?: boolean;
}) {
  const policy = defaultPolicy();
  const d = opts.dossier ?? dossier();
  const planned = planQuestions(policy.rules, d);
  return runEngine({
    policy,
    dossier: d,
    answers: opts.answers ?? {},
    skipped: planned.skipped,
    failOn: opts.failOn ?? "gate",
    considered: planned.considered,
    asked: opts.asked ?? true,
  });
}

describe("engine", () => {
  it("fails on secret regex without using Jev answers", () => {
    const result = run({
      asked: false,
      answers: { looks_like_secret: { type: "noul", noul: 0.01 } },
      dossier: dossier({
        preflight: {
          secret_regex_hits: [{ path: "src/app.ts", pattern_id: "AKIA[0-9A-Z]{16}" }],
          has_test_file_change: false,
          has_changelog_change: false,
          file_count: 1,
          truncated: false,
        },
      }),
    });
    expect(result.fails).toBe(true);
    expect(result.findings[0]?.id).toBe("looks_like_secret");
    expect(result.findings[0]?.decided_by).toBe("rules");
    expect(result.findings[0]?.reason).toBe("`looks_like_secret` regex hit → fail");
  });

  it("fails missing_tests at default 0.80", () => {
    const result = run({
      answers: { missing_tests: { type: "noul", noul: 0.8 } },
    });
    expect(result.fails).toBe(true);
    expect(result.findings.some((f) => f.id === "missing_tests" && f.on === "fail")).toBe(true);
  });

  it("does not fail missing_tests below threshold", () => {
    const result = run({
      answers: { missing_tests: { type: "noul", noul: 0.79 } },
    });
    expect(result.fails).toBe(false);
  });

  it("comments touches_auth and does not fail the check", () => {
    const result = run({
      dossier: dossier({
        files: [{ path: "src/auth/session.ts", status: "M", additions: 2, deletions: 0 }],
      }),
      answers: { touches_auth: { type: "noul", noul: 0.91 } },
    });
    expect(result.fails).toBe(false);
    const hit = result.findings.find((f) => f.id === "touches_auth");
    expect(hit?.on).toBe("comment");
    expect(hit?.reason).toBe("`touches_auth` 0.91 ≥ 0.75 → comment");
  });

  it("comments change_kind mixed at confidence >= 0.55 and does not fail", () => {
    const result = run({
      answers: {
        change_kind: { type: "choice", choice: "mixed", confidence: 0.55 },
      },
    });
    expect(result.fails).toBe(false);
    expect(result.findings.some((f) => f.id === "change_kind" && f.on === "comment")).toBe(true);
  });

  it("comments uncertain change_kind and does not fail", () => {
    const result = run({
      answers: {
        change_kind: { type: "choice", choice: "feature", confidence: 0.4 },
      },
    });
    expect(result.fails).toBe(false);
    expect(result.findings[0]?.reason).toContain("uncertain");
  });

  it("FAIL_ON=never never fails", () => {
    const result = run({
      failOn: "never",
      answers: { missing_tests: { type: "noul", noul: 0.99 } },
    });
    expect(result.fails).toBe(false);
    expect(result.findings.length).toBeGreaterThan(0);
  });

  it("FAIL_ON=any-finding fails on comments", () => {
    const result = run({
      failOn: "any-finding",
      dossier: dossier({
        files: [{ path: "src/auth/x.ts", status: "M", additions: 1, deletions: 0 }],
      }),
      answers: { touches_auth: { type: "noul", noul: 0.91 } },
    });
    expect(result.fails).toBe(true);
  });

  it("skips path-gated rules when no file matches", () => {
    const result = run({ answers: {} });
    expect(result.skipped.some((s) => s.id === "touches_auth" && s.reason === "paths")).toBe(true);
    const row = result.rows.find((r) => r.id === "touches_auth");
    expect(row?.answer).toBe("skipped (paths)");
  });

  it("lists a user rule in considered when present", () => {
    const policy = defaultPolicy();
    const extra: Rule = {
      id: "weakens_tests",
      on: "fail",
      threshold: 0.8,
      type: "noul",
      ask: "weakens tests",
    };
    policy.rules.push(extra);
    const d = dossier();
    const planned = planQuestions(policy.rules, d);
    const result = runEngine({
      policy,
      dossier: d,
      answers: { weakens_tests: { type: "noul", noul: 0.9 } },
      skipped: planned.skipped,
      failOn: "gate",
      considered: planned.considered,
    });
    expect(result.fails).toBe(true);
    expect(result.findings[0]?.id).toBe("weakens_tests");
  });
});

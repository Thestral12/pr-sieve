import { describe, expect, it } from "vitest";
import { planQuestions } from "../src/plan.js";
import type { Dossier, Rule } from "../src/types.js";

const dossier: Dossier = {
  surface: "pr",
  title: "feat: x",
  body: "",
  author_association: "NONE",
  files: [{ path: "src/a.ts", status: "M", additions: 1, deletions: 0 }],
  path_tags: [],
  preflight: {
    secret_regex_hits: [],
    has_test_file_change: false,
    has_changelog_change: false,
    file_count: 1,
    truncated: false,
  },
  diff: "",
};

function rule(id: string, over: Partial<Rule> = {}): Rule {
  return { id, on: "comment", threshold: 0.7, type: "noul", ask: id, ...over };
}

describe("planQuestions", () => {
  it("caps Jev questions at 12 and skips the rest", () => {
    const rules = Array.from({ length: 15 }, (_, i) => rule(`r${i}`));
    const planned = planQuestions(rules, dossier);
    expect(planned.send).toHaveLength(12);
    expect(planned.skipped.filter((s) => s.reason === "cap")).toHaveLength(3);
  });

  it("skips title_matches that miss", () => {
    const planned = planQuestions([rule("claimed", { title_matches: "(?i)refactor" })], dossier);
    expect(planned.skipped[0]?.reason).toBe("title");
    expect(planned.send).toHaveLength(0);
  });

  it("treats handoff (?i) as a JS i flag", () => {
    const titled = { ...dossier, title: "Refactor: tidy" };
    const planned = planQuestions([rule("claimed", { title_matches: "(?i)refactor" })], titled);
    expect(planned.send.map((r) => r.id)).toEqual(["claimed"]);
  });
});

import { describe, expect, it } from "vitest";
import { renderComment, statusLine } from "../src/comment.js";
import { COMMENT_MARKER } from "../src/types.js";
import { defaultPolicy } from "../src/policy/load.js";

describe("comment shape", () => {
  it("locks the table and one-line status", () => {
    const body = renderComment({
      status: "1 failing gate",
      engine: {
        findings: [],
        skipped: [],
        fails: true,
        rows: [
          { id: "touches_auth", answer: "noul 0.91", gate: "comment ≥ 0.75", action: "comment" },
          { id: "missing_tests", answer: "noul 0.22", gate: "≥ 0.80", action: "—" },
        ],
      },
      policy: defaultPolicy(),
      model: "jev-1.13.0",
      ms: 412,
      truncated: true,
    });
    expect(body.startsWith(COMMENT_MARKER)).toBe(true);
    expect(body).toContain("## pr-sieve");
    expect(body).toContain("1 failing gate");
    expect(body).toContain("| Rule | Answer | Gate | Action |");
    expect(body).toContain("| `touches_auth` | noul 0.91 | comment ≥ 0.75 | comment |");
    expect(body).toContain("truncated_diff=true");
    expect(body).not.toContain("consider adding");
  });

  it("uses the locked status lines", () => {
    expect(statusLine({ kind: "ok", fails: false, findingsFailCount: 0 })).toBe("clean");
    expect(statusLine({ kind: "ok", fails: true, findingsFailCount: 1 })).toBe("1 failing gate");
    expect(statusLine({ kind: "degraded", fails: false, findingsFailCount: 0 })).toBe("sieve degraded");
    expect(statusLine({ kind: "fork-skip", fails: false, findingsFailCount: 0 })).toBe(
      "sieve skipped: no key on fork PR",
    );
  });
});

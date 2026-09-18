import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { evalFixture, loadFixtures, summarizeEval } from "../src/eval.js";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "research", "fixtures", "prs");

describe("golden fixtures (mocked engine)", () => {
  it("has at least 16 fixtures and meets the gold bar", () => {
    const fixtures = loadFixtures(dir);
    expect(fixtures.length).toBeGreaterThanOrEqual(16);
    const summary = summarizeEval(fixtures.map(evalFixture));
    expect(summary.rulesRate).toBe(1);
    expect(summary.goldRate).toBeGreaterThanOrEqual(0.85);
    for (const row of summary.rows) {
      expect(row.match, `${row.id} expected fail=${row.expectFail} actual=${row.actualFail}`).toBe(
        true,
      );
    }
  });
});

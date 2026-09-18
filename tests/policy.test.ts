import { describe, expect, it } from "vitest";
import { parsePolicyText } from "../src/policy/load.js";

describe("policy schema", () => {
  it("ignores unknown keys", () => {
    const result = parsePolicyText(
      "version: 1\nfuture_field: true\nbuiltin:\n  missing_tests:\n    on: comment\n    extra: 1\n",
      { source: "head", path: ".jev.yml" },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const rule = result.policy.rules.find((r) => r.id === "missing_tests");
      expect(rule?.on).toBe("comment");
    }
  });

  it("rejects wrong types and reports a Zod path", () => {
    const result = parsePolicyText("version: 1\nrules:\n  - id: x\n    on: fail\n    threshold: \"hot\"\n    ask: hi\n", {
      source: "head",
      path: ".jev.yml",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/threshold/);
    }
  });

  it("lets user rules override builtin ids", () => {
    const result = parsePolicyText(
      "version: 1\nrules:\n  - id: missing_tests\n    on: comment\n    threshold: 0.5\n    ask: custom\n",
      { source: "base", path: ".jev.yml" },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const rule = result.policy.rules.find((r) => r.id === "missing_tests");
      expect(rule?.on).toBe("comment");
      expect(rule?.threshold).toBe(0.5);
      expect(rule?.ask).toBe("custom");
    }
  });

  it("defaults touches_auth to comment", () => {
    const result = parsePolicyText("version: 1\n", { source: "default", path: "(default)" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.policy.rules.find((r) => r.id === "touches_auth")?.on).toBe("comment");
    }
  });
});

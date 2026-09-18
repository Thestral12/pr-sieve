import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runEngine } from "./engine.js";
import { answersFromUnknown, callJev } from "./jev/client.js";
import { questionsFromRules } from "./packs/pr.v1.js";
import { planQuestions } from "./plan.js";
import { defaultPolicy, parsePolicyText } from "./policy/load.js";
import { secretShortCircuit } from "./pipeline.js";
import type { Answers, Dossier, FailOn, LoadedPolicy } from "./types.js";

export type FixtureFile = {
  id: string;
  gold?: boolean;
  layer?: "rules" | "jev";
  failOn?: FailOn;
  answers?: Answers;
  policy_yaml?: string;
  dossier: Dossier;
  expected: {
    fails: boolean;
    finding_ids?: string[];
  };
};

export type EvalRow = {
  id: string;
  layer: "rules" | "jev";
  gold: boolean;
  expectFail: boolean;
  actualFail: boolean;
  match: boolean;
  findingIds: string[];
  live?: boolean;
  error?: string;
  model?: string;
  inputTokens?: number;
  ms?: number;
};

export function loadFixtures(dir: string): FixtureFile[] {
  const names = readdirSync(dir)
    .filter((n) => n.endsWith(".json"))
    .sort();
  return names.map((name) => {
    const raw = JSON.parse(readFileSync(join(dir, name), "utf8")) as FixtureFile;
    return raw;
  });
}

export function evalFixture(fixture: FixtureFile): EvalRow {
  const policy = policyForFixture(fixture);

  const planned = planQuestions(policy.rules, fixture.dossier);
  const answers = answersFromUnknown(fixture.answers ?? {});
  const asked = fixture.dossier.preflight.secret_regex_hits.length === 0;
  const engine = runEngine({
    policy,
    dossier: fixture.dossier,
    answers,
    skipped: planned.skipped,
    failOn: fixture.failOn ?? "gate",
    considered: planned.considered,
    asked,
  });

  return {
    id: fixture.id,
    layer: fixture.layer ?? "jev",
    gold: fixture.gold !== false,
    expectFail: fixture.expected.fails,
    actualFail: engine.fails,
    match: engine.fails === fixture.expected.fails,
    findingIds: engine.findings.map((f) => f.id),
  };
}

export function policyForFixture(fixture: FixtureFile): LoadedPolicy {
  if (!fixture.policy_yaml) return defaultPolicy();
  const loaded = parsePolicyText(fixture.policy_yaml, {
    source: "head",
    path: `${fixture.id}.yml`,
  });
  if (!loaded.ok) throw new Error(loaded.message);
  return loaded.policy;
}

export async function evalFixtureLive(
  fixture: FixtureFile,
  opts: { apiKey: string; model?: string },
): Promise<EvalRow> {
  const policy = policyForFixture(fixture);
  const planned = planQuestions(policy.rules, fixture.dossier);
  const shortCircuit = secretShortCircuit(fixture.dossier, policy);
  const base = {
    id: fixture.id,
    layer: fixture.layer ?? "jev",
    gold: fixture.gold !== false,
    expectFail: fixture.expected.fails,
    live: true as const,
  };

  if (shortCircuit || planned.send.length === 0) {
    const engine = runEngine({
      policy,
      dossier: fixture.dossier,
      answers: {},
      skipped: planned.skipped,
      failOn: fixture.failOn ?? "gate",
      considered: planned.considered,
      asked: false,
    });
    return {
      ...base,
      actualFail: engine.fails,
      match: engine.fails === fixture.expected.fails,
      findingIds: engine.findings.map((f) => f.id),
    };
  }

  const jev = await callJev({
    state: fixture.dossier,
    questions: questionsFromRules(planned.send),
    apiKey: opts.apiKey,
    model: opts.model,
  });
  if (!jev.ok) {
    return {
      ...base,
      actualFail: false,
      match: false,
      findingIds: [],
      error: jev.error,
      ms: jev.ms,
    };
  }

  const engine = runEngine({
    policy,
    dossier: fixture.dossier,
    answers: jev.answers,
    skipped: planned.skipped,
    failOn: fixture.failOn ?? "gate",
    considered: planned.considered,
    asked: true,
  });
  return {
    ...base,
    actualFail: engine.fails,
    match: engine.fails === fixture.expected.fails,
    findingIds: engine.findings.map((f) => f.id),
    model: jev.model,
    inputTokens: jev.usage?.input_tokens,
    ms: jev.ms,
  };
}

export function summarizeEval(rows: readonly EvalRow[]): {
  rows: EvalRow[];
  goldRate: number;
  rulesRate: number;
  gold: EvalRow[];
  rules: EvalRow[];
} {
  const gold = rows.filter((r) => r.gold);
  const rules = rows.filter((r) => r.layer === "rules");
  const goldHits = gold.filter((r) => r.match).length;
  const rulesHits = rules.filter((r) => r.match).length;
  return {
    rows: [...rows],
    gold,
    rules,
    goldRate: gold.length === 0 ? 1 : goldHits / gold.length,
    rulesRate: rules.length === 0 ? 1 : rulesHits / rules.length,
  };
}

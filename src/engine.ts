import type {
  Answer,
  Answers,
  Dossier,
  EngineResult,
  FailOn,
  Finding,
  Policy,
  Rule,
  Skipped,
  TableRow,
} from "./types.js";
import { MIXED_CONFIDENCE } from "./types.js";

function fmt(n: number): string {
  return n.toFixed(2);
}

function noulReason(id: string, value: number, threshold: number, on: string): string {
  return `\`${id}\` ${fmt(value)} ≥ ${fmt(threshold)} → ${on}`;
}

function regexReason(id: string, on: string): string {
  return `\`${id}\` regex hit → ${on}`;
}

function choiceReason(id: string, choice: string, confidence: number, on: string): string {
  return `\`${id}\` ${choice} (confidence ${fmt(confidence)}) → ${on}`;
}

function uncertainReason(id: string, confidence: number): string {
  return `\`${id}\` uncertain (confidence ${fmt(confidence)}) → comment`;
}

function skipLabel(reason: Skipped["reason"]): string {
  if (reason === "paths") return "skipped (paths)";
  if (reason === "title") return "skipped (title)";
  if (reason === "not_paths") return "skipped (not_paths)";
  return "skipped (cap)";
}

function gateLabel(rule: Rule): string {
  if (rule.type === "choice") {
    return `${rule.on} ≥ ${fmt(rule.threshold)} conf`;
  }
  if (rule.on === "comment") return `comment ≥ ${fmt(rule.threshold)}`;
  return `≥ ${fmt(rule.threshold)}`;
}

function shouldFail(findings: readonly Finding[], failOn: FailOn): boolean {
  if (failOn === "never") return false;
  if (failOn === "any-finding") return findings.length > 0;
  return findings.some((f) => f.on === "fail");
}

export function runEngine(input: {
  policy: Policy;
  dossier: Dossier;
  answers: Answers;
  skipped: readonly Skipped[];
  failOn: FailOn;
  considered: readonly Rule[];
  asked?: boolean;
}): EngineResult {
  const { policy, dossier, answers, skipped, failOn, considered, asked = true } = input;
  const findings: Finding[] = [];
  const rows: TableRow[] = [];
  const skipById = new Map(skipped.map((s) => [s.id, s]));
  const secretHits = dossier.preflight.secret_regex_hits;

  const ruleById = new Map(policy.rules.map((r) => [r.id, r]));

  for (const rule of considered) {
    const skip = skipById.get(rule.id);
    if (skip) {
      rows.push({
        id: rule.id,
        answer: skipLabel(skip.reason),
        gate: gateLabel(rule),
        action: "—",
      });
      continue;
    }

    if (rule.id === "looks_like_secret" && secretHits.length > 0 && rule.on !== "ignore") {
      const on = rule.on;
      findings.push({
        id: rule.id,
        value: 1,
        on,
        decided_by: "rules",
        reason: regexReason(rule.id, on),
      });
      rows.push({
        id: rule.id,
        answer: "regex hit",
        gate: gateLabel(rule),
        action: on,
      });
      continue;
    }

    if (!asked) {
      rows.push({
        id: rule.id,
        answer: "—",
        gate: gateLabel(rule),
        action: "—",
      });
      continue;
    }

    const answer = answers[rule.id];
    pushFromAnswer(rule, answer, findings, rows);
  }

  // Surface unknown answer keys only if they map to a rule we somehow missed.
  for (const id of Object.keys(answers)) {
    if (ruleById.has(id)) continue;
  }

  return {
    findings,
    skipped: [...skipped],
    rows,
    fails: shouldFail(findings, failOn),
  };
}

function pushFromAnswer(
  rule: Rule,
  answer: Answer | undefined,
  findings: Finding[],
  rows: TableRow[],
): void {
  if (!answer) {
    rows.push({
      id: rule.id,
      answer: rule.type === "noul" ? "noul 0.00" : "—",
      gate: gateLabel(rule),
      action: "—",
    });
    return;
  }

  if (answer.type === "noul") {
    const value = answer.noul;
    const fires = value >= rule.threshold && rule.on !== "ignore";
    if (fires && rule.on !== "ignore") {
      findings.push({
        id: rule.id,
        value,
        on: rule.on,
        decided_by: "jev",
        reason: noulReason(rule.id, value, rule.threshold, rule.on),
      });
    }
    rows.push({
      id: rule.id,
      answer: `noul ${fmt(value)}`,
      gate: gateLabel(rule),
      action: fires && rule.on !== "ignore" ? rule.on : "—",
    });
    return;
  }

  if (answer.type === "score") {
    const value = answer.score;
    const fires = value >= rule.threshold && rule.on !== "ignore";
    if (fires && rule.on !== "ignore") {
      findings.push({
        id: rule.id,
        value,
        on: rule.on,
        decided_by: "jev",
        reason: noulReason(rule.id, value, rule.threshold, rule.on),
      });
    }
    rows.push({
      id: rule.id,
      answer: `score ${fmt(value)}`,
      gate: gateLabel(rule),
      action: fires && rule.on !== "ignore" ? rule.on : "—",
    });
    return;
  }

  const { choice, confidence } = answer;
  if (rule.id === "change_kind" || rule.type === "choice") {
    if (confidence < (rule.threshold || MIXED_CONFIDENCE)) {
      findings.push({
        id: rule.id,
        value: confidence,
        on: "comment",
        decided_by: "jev",
        reason: uncertainReason(rule.id, confidence),
        choice,
        confidence,
      });
      rows.push({
        id: rule.id,
        answer: `${choice} conf ${fmt(confidence)}`,
        gate: gateLabel(rule),
        action: "comment",
      });
      return;
    }

    if (choice === "mixed" && rule.on !== "ignore") {
      findings.push({
        id: rule.id,
        value: confidence,
        on: "comment",
        decided_by: "jev",
        reason: choiceReason(rule.id, "mixed", confidence, "comment"),
        choice,
        confidence,
      });
      rows.push({
        id: rule.id,
        answer: `mixed ${fmt(confidence)}`,
        gate: gateLabel(rule),
        action: "comment",
      });
      return;
    }
  }

  rows.push({
    id: rule.id,
    answer: `${choice} ${fmt(confidence)}`,
    gate: gateLabel(rule),
    action: "—",
  });
}

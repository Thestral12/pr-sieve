import { questionsFromRules } from "./packs/pr.v1.js";
import { renderComment, statusLine } from "./comment.js";
import { writeDossierFile } from "./dossier.js";
import { runEngine } from "./engine.js";
import { callJev, isMockMode } from "./jev/client.js";
import { planQuestions } from "./plan.js";
import type {
  Answers,
  CommentMode,
  Dossier,
  FailOn,
  LoadedPolicy,
  SieveResult,
} from "./types.js";

export type PipelineInput = {
  policy: LoadedPolicy;
  dossier: Dossier;
  failOn: FailOn;
  comment: CommentMode;
  answers?: Answers;
  mock?: boolean;
  apiKey?: string;
  model?: string;
  writeDossier?: boolean;
};

export function secretShortCircuit(dossier: Dossier, policy: LoadedPolicy): boolean {
  if (dossier.preflight.secret_regex_hits.length === 0) return false;
  const rule = policy.rules.find((r) => r.id === "looks_like_secret");
  return Boolean(rule && rule.on !== "ignore");
}

export async function runPipeline(input: PipelineInput): Promise<SieveResult> {
  const { policy, dossier, failOn } = input;
  const mock = input.mock ?? isMockMode();
  const planned = planQuestions(policy.rules, dossier);
  const shortCircuit = secretShortCircuit(dossier, policy);
  const dossierPath = input.writeDossier === false ? undefined : writeDossierFile(dossier);

  let answers: Answers = { ...input.answers };
  let model = input.model ?? (mock ? "mock" : "jev-latest");
  let ms = 0;
  let asked = !shortCircuit;

  if (!shortCircuit && planned.send.length > 0 && !input.answers && !mock) {
    const questions = questionsFromRules(planned.send);
    const jev = await callJev({
      state: dossier,
      questions,
      apiKey: input.apiKey,
      model: input.model,
    });
    ms = jev.ms;
    if (!jev.ok) {
      if (jev.degraded) {
        const status = statusLine({ kind: "degraded", fails: false, findingsFailCount: 0 });
        return {
          kind: "degraded",
          conclusion: "neutral",
          statusLine: status,
          commentBody: renderComment({
            status,
            policy,
            model,
            ms,
            truncated: dossier.preflight.truncated,
          }),
          policy,
          dossier,
          model,
          ms,
          truncated: dossier.preflight.truncated,
          error: jev.error,
          dossierPath,
        };
      }
      return {
        kind: "setup-error",
        conclusion: "failure",
        statusLine: statusLine({
          kind: "setup-error",
          fails: true,
          findingsFailCount: 0,
          error: jev.error,
        }),
        commentBody: renderComment({
          status: jev.error,
          policy,
          truncated: dossier.preflight.truncated,
        }),
        policy,
        dossier,
        error: jev.error,
        dossierPath,
      };
    }
    answers = jev.answers;
    model = jev.model;
  } else if (mock && !input.answers) {
    model = "mock";
  } else if (shortCircuit) {
    asked = false;
  }

  const engine = runEngine({
    policy,
    dossier,
    answers,
    skipped: planned.skipped,
    failOn,
    considered: planned.considered,
    asked,
  });

  const failCount = engine.findings.filter((f) => f.on === "fail").length;
  const status = statusLine({
    kind: "ok",
    fails: engine.fails,
    findingsFailCount: failCount,
  });
  const commentBody = renderComment({
    status,
    engine,
    policy,
    model,
    ms,
    truncated: dossier.preflight.truncated,
  });

  return {
    kind: "ok",
    conclusion: engine.fails ? "failure" : "success",
    statusLine: status,
    commentBody,
    engine,
    policy,
    dossier,
    model,
    ms,
    truncated: dossier.preflight.truncated,
    dossierPath,
  };
}

export function shouldPostComment(mode: CommentMode, result: SieveResult): boolean {
  if (mode === "never") return false;
  if (mode === "always") return true;
  return true;
}

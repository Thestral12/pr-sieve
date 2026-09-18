import {
  APIConnectionError,
  APITimeoutError,
  InternalServerError,
  RateLimitError,
  TypeSafeClient,
  AuthenticationError,
  type Questions,
} from "@typesafe-ai/sdk";
import type { Answer, Answers } from "../types.js";

export type JevSuccess = {
  ok: true;
  answers: Answers;
  model: string;
  ms: number;
  usage?: { input_tokens: number; output_tokens: number };
  raw: { model: string; answers: unknown; usage?: { input_tokens: number; output_tokens: number } };
};

export type JevFailure = {
  ok: false;
  degraded: boolean;
  error: string;
  ms: number;
};

export type JevResult = JevSuccess | JevFailure;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function coerceAnswers(raw: unknown): Answers {
  const answers: Answers = {};
  if (!isRecord(raw)) return answers;
  for (const [id, value] of Object.entries(raw)) {
    if (!isRecord(value) || typeof value.type !== "string") continue;
    if (value.type === "noul" && typeof value.noul === "number") {
      answers[id] = { type: "noul", noul: value.noul };
    } else if (
      value.type === "choice" &&
      typeof value.choice === "string" &&
      typeof value.confidence === "number"
    ) {
      answers[id] = {
        type: "choice",
        choice: value.choice,
        confidence: value.confidence,
        probabilities: isRecord(value.probabilities)
          ? (value.probabilities as Record<string, number>)
          : undefined,
      };
    } else if (value.type === "score" && typeof value.score === "number") {
      answers[id] = {
        type: "score",
        score: value.score,
        confidence: typeof value.confidence === "number" ? value.confidence : 1,
      };
    }
  }
  return answers;
}

export function isMockMode(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.SIEVE_MOCK;
  return v === "1" || v === "true";
}

export async function callJev(opts: {
  state: unknown;
  questions: Questions;
  apiKey?: string;
  model?: string;
}): Promise<JevResult> {
  const started = Date.now();
  try {
    const client = new TypeSafeClient({
      apiKey: opts.apiKey,
      defaultModel: opts.model,
      logLevel: "warn",
    });
    const response = await client.systemOne({
      state: opts.state as import("@typesafe-ai/sdk").EntryType,
      questions: opts.questions,
      model: opts.model,
    });
    return {
      ok: true,
      answers: coerceAnswers(response.answers) as Answers,
      model: response.model,
      ms: Date.now() - started,
      usage: response.usage,
      raw: { model: response.model, answers: response.answers, usage: response.usage },
    };
  } catch (err) {
    const ms = Date.now() - started;
    const message = err instanceof Error ? err.message : String(err);
    if (
      err instanceof RateLimitError ||
      err instanceof InternalServerError ||
      err instanceof APITimeoutError ||
      err instanceof APIConnectionError
    ) {
      return { ok: false, degraded: true, error: message, ms };
    }
    if (err instanceof AuthenticationError) {
      return { ok: false, degraded: false, error: message, ms };
    }
    return { ok: false, degraded: true, error: message, ms };
  }
}

export function answersFromUnknown(raw: unknown): Answers {
  return coerceAnswers(raw);
}

export type { Answer };

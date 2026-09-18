import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { dossierFromGit } from "./dossier.js";
import { evalFixture, evalFixtureLive, loadFixtures, summarizeEval } from "./eval.js";
import { loadDotenv } from "./env.js";
import { callJev, isMockMode } from "./jev/client.js";
import { noul } from "@typesafe-ai/sdk";
import { defaultPolicy, loadPolicy, parsePolicyText } from "./policy/load.js";
import { runPipeline } from "./pipeline.js";
import type { CommentMode, Dossier, FailOn } from "./types.js";

type Flags = Record<string, string | boolean>;

function parseArgv(argv: string[]): { cmd: string; flags: Flags } {
  const cmd = argv[0] ?? "help";
  const flags: Flags = {};
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) flags[key] = true;
    else {
      flags[key] = next;
      i++;
    }
  }
  return { cmd, flags };
}

function flag(flags: Flags, name: string, fallback?: string): string | undefined {
  const v = flags[name];
  if (typeof v !== "string") return fallback;
  return v;
}

function asFailOn(v: string | undefined): FailOn {
  if (v === "never" || v === "any-finding" || v === "gate") return v;
  return "gate";
}

function asComment(v: string | undefined): CommentMode {
  if (v === "always" || v === "never" || v === "sticky") return v;
  return "sticky";
}

function printHelp(): void {
  console.log(`pr-sieve — semantic PR gate (not a review bot)

Usage:
  sieve diff --base <ref> --head <ref> [--config .jev.yml]
  sieve file --dossier <path> [--config .jev.yml]
  sieve eval [--dir research/fixtures/prs] [--live]   # --live calls Jev
  sieve doctor [--config .jev.yml]                    # writes research/sample-jev-response.json

Env:
  TYPESAFE_API_KEY   TypeSafe key
  SIEVE_MOCK=1       skip live Jev; use fixture answers / rules-only
`);
}

async function cmdDiff(flags: Flags): Promise<number> {
  const cwd = process.cwd();
  const base = flag(flags, "base");
  const head = flag(flags, "head", "HEAD");
  if (!base) {
    console.error("sieve diff: --base is required");
    return 2;
  }
  const config = flag(flags, "config", ".jev.yml")!;
  const loaded = loadPolicy({ cwd, configPath: config, baseSha: base });
  if (!loaded.ok) {
    console.error(loaded.message);
    return 1;
  }
  const dossier = dossierFromGit({
    cwd,
    base,
    head: head ?? "HEAD",
    policy: loaded.policy,
    title: flag(flags, "title") ?? `diff ${base}...${head}`,
    body: flag(flags, "body") ?? "",
  });
  const result = await runPipeline({
    policy: loaded.policy,
    dossier,
    failOn: asFailOn(flag(flags, "fail-on")),
    comment: asComment(flag(flags, "comment")),
    apiKey: process.env.TYPESAFE_API_KEY,
    model: flag(flags, "model"),
    mock: isMockMode(),
  });
  console.log(result.commentBody);
  if (result.dossierPath) console.error(`dossier: ${result.dossierPath}`);
  return result.conclusion === "failure" ? 1 : 0;
}

async function cmdFile(flags: Flags): Promise<number> {
  const dossierPath = flag(flags, "dossier");
  if (!dossierPath) {
    console.error("sieve file: --dossier is required");
    return 2;
  }
  const raw = JSON.parse(readFileSync(resolve(dossierPath), "utf8")) as {
    dossier?: Dossier;
    answers?: unknown;
    policy_yaml?: string;
    failOn?: FailOn;
  } & Dossier;
  const dossier: Dossier = raw.dossier ?? (raw as Dossier);
  const cwd = process.cwd();
  const config = flag(flags, "config", ".jev.yml")!;
  let policy = defaultPolicy();
  if (raw.policy_yaml) {
    const parsed = parsePolicyText(raw.policy_yaml, { source: "head", path: dossierPath });
    if (!parsed.ok) {
      console.error(parsed.message);
      return 1;
    }
    policy = parsed.policy;
  } else if (existsSync(config)) {
    const loaded = loadPolicy({ cwd, configPath: config, fromFile: true });
    if (!loaded.ok) {
      console.error(loaded.message);
      return 1;
    }
    policy = loaded.policy;
  }
  const result = await runPipeline({
    policy,
    dossier,
    failOn: asFailOn(flag(flags, "fail-on") ?? raw.failOn),
    comment: asComment(flag(flags, "comment")),
    answers: raw.answers as never,
    apiKey: process.env.TYPESAFE_API_KEY,
    model: flag(flags, "model"),
    mock: isMockMode() || Boolean(raw.answers),
    writeDossier: false,
  });
  console.log(result.commentBody);
  return result.conclusion === "failure" ? 1 : 0;
}

async function cmdEval(flags: Flags): Promise<number> {
  const dir = resolve(flag(flags, "dir", join(process.cwd(), "research", "fixtures", "prs"))!);
  const live = flags.live === true;
  const fixtures = loadFixtures(dir);
  const rows = live
    ? await (async () => {
        const key = process.env.TYPESAFE_API_KEY;
        if (!key) {
          console.error("sieve eval --live needs TYPESAFE_API_KEY");
          return null;
        }
        const out = [];
        for (const fixture of fixtures) {
          out.push(await evalFixtureLive(fixture, { apiKey: key, model: flag(flags, "model") }));
        }
        return out;
      })()
    : fixtures.map(evalFixture);
  if (rows === null) return 2;
  const summary = summarizeEval(rows);
  const pad = (s: string, n: number) => s.padEnd(n);
  console.log(`${pad("id", 32)}${pad("layer", 8)}${pad("expect", 8)}${pad("actual", 8)}match`);
  for (const row of rows) {
    const mark = row.error
      ? `ERR ${row.error}`
      : row.match
        ? "ok"
        : `MISS [${row.findingIds.join(",") || "none"}]`;
    console.log(
      `${pad(row.id, 32)}${pad(row.layer, 8)}${pad(row.expectFail ? "fail" : "pass", 8)}${pad(row.actualFail ? "fail" : "pass", 8)}${mark}`,
    );
  }
  const goldHits = summary.gold.filter((r) => r.match).length;
  const rulesHits = summary.rules.filter((r) => r.match).length;
  const tokens = rows.reduce((sum, r) => sum + (r.inputTokens ?? 0), 0);
  const ms = rows.reduce((sum, r) => sum + (r.ms ?? 0), 0);
  console.log("");
  console.log(
    `fixtures: ${rows.length}  rules-layer: ${rulesHits}/${summary.rules.length} (${(summary.rulesRate * 100).toFixed(0)}%)  gold fail-match: ${goldHits}/${summary.gold.length} (${(summary.goldRate * 100).toFixed(0)}%)`,
  );
  if (live) {
    const model = rows.find((r) => r.model)?.model ?? "jev-latest";
    console.log(`mode: live Jev (${model})  input_tokens=${tokens}  wall=${ms}ms`);
  } else {
    console.log("mode: mocked engine (fixture answers). Live Jev not run.");
  }
  const rulesOk = summary.rulesRate >= 1;
  const goldOk = summary.goldRate >= 0.85;
  return rulesOk && goldOk ? 0 : 1;
}

async function cmdDoctor(flags: Flags): Promise<number> {
  const config = flag(flags, "config", ".jev.yml")!;
  const loaded = existsSync(config)
    ? loadPolicy({ cwd: process.cwd(), configPath: config, fromFile: true })
    : { ok: true as const, policy: defaultPolicy() };
  if (!loaded.ok) {
    console.error(`config: FAIL ${loaded.message}`);
    return 1;
  }
  console.log(`config: ok (${loaded.policy.path}, ${loaded.policy.rules.length} rules, source ${loaded.policy.source})`);

  const mock = isMockMode();
  const key = process.env.TYPESAFE_API_KEY;
  if (mock) {
    console.log("key: skipped (SIEVE_MOCK=1)");
    console.log("sample call: skipped (mock)");
    return 0;
  }
  if (!key) {
    console.log("key: missing TYPESAFE_API_KEY");
    console.log("sample call: not run");
    return 2;
  }
  console.log("key: present");
  const jev = await callJev({
    apiKey: key,
    model: flag(flags, "model"),
    state: { note: "pr-sieve doctor probe", diff: "--- a/x\n+++ b/x\n+hello\n" },
    questions: { ping: noul("This is a tiny connectivity probe, not a real PR judgment.") },
  });
  if (!jev.ok) {
    console.error(`sample call: FAIL ${jev.error}`);
    return jev.degraded ? 0 : 1;
  }
  console.log(`sample call: ok model=${jev.model} ${jev.ms}ms`);
  const samplePath = join(process.cwd(), "research", "sample-jev-response.json");
  writeFileSync(
    samplePath,
    `${JSON.stringify(
      {
        live_call: true,
        captured_at: new Date().toISOString(),
        ms: jev.ms,
        model: jev.model,
        usage: jev.usage ?? null,
        answers: jev.raw.answers,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  console.log(`wrote ${samplePath}`);
  return 0;
}

async function main(): Promise<void> {
  loadDotenv();
  const { cmd, flags } = parseArgv(process.argv.slice(2));
  if (cmd === "help" || cmd === "-h" || cmd === "--help" || flags.help) {
    printHelp();
    return;
  }
  let code = 0;
  if (cmd === "diff") code = await cmdDiff(flags);
  else if (cmd === "file") code = await cmdFile(flags);
  else if (cmd === "eval") code = await cmdEval(flags);
  else if (cmd === "doctor") code = await cmdDoctor(flags);
  else {
    printHelp();
    code = 2;
  }
  process.exitCode = code;
}

void main();

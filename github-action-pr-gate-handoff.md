# AGENT HANDOFF — GitHub Action Semantic PR Gate

**Codename:** `pr-sieve` (working name; rename if you want)
**Owner intent:** Research, then build an MVP a repo can add as one workflow + one `.jev.yml`.
**Source idea:** A GitHub Action that runs **user-defined Nouls** (plus a small built-in pack) against a PR dossier. Fail the check when a gated question fires above threshold. Otherwise leave a short comment. No generated review essay.

Give this whole file to the coding agent. It is the spec.

---

## 0. How to use this document

Work in this order. Do not skip research.

1. Read §1–§4. If live docs conflict, **docs win** — note the diff in `NOTES.md`.
2. Complete §5. Write findings into `research/FINDINGS.md`.
3. Lock `.jev.yml` schema + question packs + engine (§6–§8). Do not add a “write a review” path.
4. Build Phase 0 → Phase 2 (§9). Stop at Phase 2 unless the human asks for Phase 3.
5. Run golden eval (§10) before claiming it works.
6. Hand back §12.

**If the agent is Claude Code / skill-capable, install the official TypeSafe skill first:**

```bash
claude plugin marketplace add typesafe-ai/skills
claude plugin install typesafe@typesafe-ai
```

or: `npx skills add typesafe-ai/skills --skill typesafe-ai`

Then read:

- https://docs.typesafe.ai/introduction
- https://docs.typesafe.ai/concepts/use-case-map (semantic code linting)
- https://docs.typesafe.ai/cookbooks/llm_guardrails
- https://github.com/typesafe-ai/typesafe-sdk-js
- https://docs.github.com/en/actions

**Default stack (lock unless research proves otherwise):**

- Node.js ≥ 20
- TypeScript (strict)
- `@typesafe-ai/sdk`
- Zod + YAML (`yaml` package) for `.jev.yml`
- `octokit` / `@actions/github` + `@actions/core`
- Ship as a **JavaScript Action** (`action.yml` + bundled `dist/`) so consumers do not build it
- Pin the published action to a SHA in the example workflow
- pnpm or npm — pick one

**Env / Action inputs:**

```
TYPESAFE_API_KEY          # repo secret; Action input typesafe-api-key
TYPESAFE_MODEL=jev-latest
JEW_CONFIG=.jev.yml       # path in the *base* repo checkout
FAIL_ON=gate              # gate | never | any-finding
COMMENT=sticky            # sticky | always | never
```

Key from https://console.typesafe.ai/settings/keys

---

## 1. One-sentence product

A CI check that treats `.jev.yml` as a semantic linter: each rule is a typed Jev question about *this PR*, and the Action fails or comments from those numbers — never from a generated essay.

---

## 2. Goals

Ship a reusable GitHub Action a repo owner can add in ten minutes:

1. **Dossier, not the repo.** Build a bounded state object: title, body, changed-file list, path tags, truncated unified diff, deterministic preflight hits. Never send the whole tree to Jev.
2. **Policy-as-code.** `.jev.yml` lists rules. Each rule is a Noul (or Choice/Score) with `on: fail | comment | ignore` and a threshold.
3. **Deterministic layer first.** Regex/path/size/test-file/changelog checks run in code. Jev only judges the fuzzy remainder.
4. **Check Run + sticky comment.** A table of rule → answer → action. No prose review. No suggested patches.
5. **Safe by default on forks.** `pull_request` only. Never execute PR code. Never use `pull_request_target` in the example workflow.

**Packageable** means:

- `uses: <owner>/pr-sieve@<sha>`
- One example workflow
- One example `.jev.yml` that already covers the original five: secrets, missing tests, changelog, refactor-vs-feature, touches-auth
- A local CLI so fixtures and `git diff` work without GitHub

---

## 3. Hard non-goals (do not build)

The market already has review *bots* and risk *scorers*. You are building a **linter-shaped gate**.

Do **not** clone or “improve by adding a reviewer persona” from:

| Project | What it is | Why we are not it |
|---|---|---|
| [moezubair/check-risk](https://github.com/moezubair/check-risk) | CLI + Action: deterministic risk + Jev signals → HIGH/MED + reviewers | Closest cousin. They score *risk*. We evaluate *your rules*. Steal the “never run PR code” stance, not the product. |
| [thiago-ss/jev-review](https://github.com/thiago-ss/jev-review) | Autonomous PR review bot, approval gates | Review essay + merge policy. Out. |
| [devagrawal09/jev-review](https://github.com/devagrawal09/jev-review) | Local multi-stage review + dashboard | Dashboard and staged review. Out. |
| [Ripwords/agent-gate-loop](https://github.com/Ripwords/agent-gate-loop) | Agent writes a PR, Jev gates a fix loop | Agent orchestrator. Out. |
| [shivam2003-dev/typesafe-triage-guard](https://github.com/shivam2003-dev/typesafe-triage-guard) | Deploy-risk battery | Useful question ideas only. |
| [raihankhan-rk/diffjury](https://github.com/raihankhan-rk/diffjury) | Paste a PR URL, get risk bars | Web toy. Out. |
| [NiazMorshed2007/jev-review](https://github.com/NiazMorshed2007/jev-review) | MCP quality scores while coding | Agent loop, not CI. |
| Patrick Desjardins’ 370-rule VS Code Jev linter | Per-file markdown rules on save | Steal “rules live in the repo as text.” We run at PR time, not on keystroke. |

Explicitly out of scope for MVP:

- Generated review comments (“consider extracting this function…”)
- Inline suggested edits / commit-on-behalf
- Auto-approve, auto-merge, or required-reviewer assignment as a product feature (a rule may *comment* `@team`, but the Action does not call the reviews API to approve)
- Running tests, installing PR `package.json`, or executing anything from the head branch
- A SaaS dashboard
- A fourth surface (MCP, Discord, IDE) — this handoff is the Action + CLI only
- Claiming Jev is a security scanner or a secret detector. Regex does secrets. Jev does “does this *look like* it handles secrets carelessly?”

If a feature is not in §2 or §9, it is a later phase.

---

## 4. Constraints the agent must not violate

### 4.1 Jev is a decision engine, not a reviewer

- Tools return Noul/Choice/Score numbers.
- The comment body is a **markdown table rendered in code** from those numbers.
- `reason` per row is a template: `` `touches_auth` 0.91 ≥ 0.75 → fail ``.
- No LLM in this repo.

### 4.2 Never run untrusted PR code

This is a security product constraint, not a style note.

- Trigger: `pull_request` (and `pull_request_review` is out). **Not** `pull_request_target` in the shipped example.
- Checkout the merge commit or head *as data*. `persist-credentials: false`.
- Do not `npm install` / `pip install` from the PR.
- Do not `uses: ./.` from the PR tree with secrets in scope.
- Read `.jev.yml` from the **base** branch when possible (so a PR cannot rewrite the gate that judges it). If the file is missing on base, fall back to Action-input default pack and comment that policy was defaulted.
- `TYPESAFE_API_KEY` is an Actions secret. Fork PRs from public repos will not receive it on `pull_request`. Behavior: post a skipped Check Run (`neutral`) with “sieve skipped: no key on fork PR”, do **not** fail the PR, do **not** log the missing key as an error that looks like a broken product.
- Document `workflow_run` (a trusted workflow on `completed` of the unprivileged job) as the **only** supported later path if they want fork PRs judged with a secret. Never recommend `pull_request_target` + checkout of head.

GitHub is rolling out protections against `pull_request_target` pwn-requests (GA 2026-09-17). Do not fight that. Document it.

### 4.3 Fail-open vs fail-closed

| Situation | Check Run | Comment |
|---|---|---|
| TypeSafe 429 / 5xx / timeout | `neutral` + “sieve degraded” (do not fail merge on vendor outage) | sticky note |
| Missing key on same-repo PR | `failure` of the *Action job setup*, not a semantic fail — the workflow is misconfigured | no |
| Missing key on fork PR | `neutral` skipped | no |
| Invalid `.jev.yml` | `failure` (config error) | yes, show Zod path |
| Deterministic secret regex hit | `failure` if that rule’s `on: fail` | yes |
| Jev noul ≥ threshold and `on: fail` | `failure` | yes |
| Jev noul ≥ threshold and `on: comment` | `success` | yes |
| No rules fired | `success` | only if `COMMENT=always` |

`FAIL_ON=never` forces comments-only. Useful while calibrating.

### 4.4 State size

Jev is cheap. Giant diffs are not useful.

- Cap total state at ~12k characters.
- Cap per-file diff hunk at 1.5k characters. Prefer added lines.
- Always include the *path list* even if the diff is truncated. Set `truncated: true`.
- Binary files: path + “binary” only.
- Lockfiles (`package-lock.json`, `pnpm-lock.yaml`, `Cargo.lock`): path only unless a rule `include_lockfiles: true`.
- Generated paths from `.jev.yml` `ignore_paths` never enter the diff.

### 4.5 Permissions (least)

Example workflow permissions:

```yaml
permissions:
  contents: read
  pull-requests: write
  checks: write
```

No `contents: write`. No `id-token` unless Phase 3 needs it. Default `GITHUB_TOKEN` only.

---

## 5. Research checklist (do this first)

Create `research/FINDINGS.md` with a short answer under every heading.

### TypeSafe

- [ ] JS SDK `systemOne` + `noul` / `choice` / `score`
- [ ] Semantic code linting blurb on the use-case map
- [ ] One live call against a dummy diff. Save `research/sample-jev-response.json`
- [ ] Confirm Noul = P(true); whether Noul also carries `confidence`

### GitHub Actions

- [ ] `action.yml` inputs/outputs, JS Action bundling (`@vercel/ncc` or equivalent)
- [ ] Check Runs API vs job conclusion. Prefer both: job exit code *and* a named Check Run `pr-sieve` so required-status-checks can target it
- [ ] Sticky comment pattern (find existing comment by marker `<!-- pr-sieve -->`, update in place)
- [ ] `pull_request` secrets behavior on forks
- [ ] Current pwn-request / `pull_request_target` defaults: https://github.blog/changelog/2026-09-17-workflow-execution-protections-in-github-actions-generally-available/
- [ ] How to get a PR diff safely: `git fetch` base + `git diff --unified=3 base...head` after checkout, **or** Pulls API `listFiles` + patch field. Measure size. Do not put the diff in an Action output (argument-list-too-long). Write a file.

### Competitors

- [ ] README of moezubair/check-risk — copy the “never run PR code” paragraph into our README in our own words
- [ ] Skim thiago-ss/jev-review and devagrawal09/jev-review so we can list 5 things we will not copy
- [ ] Optional: Patrick Desjardins rule-file format (frontmatter `applies_to`) — may inform `paths:` on our rules

### Fixtures

Collect 16+ synthetic PRs in `research/fixtures/prs.json` before writing Action glue. See §10.

---

## 6. Product surfaces

### 6.1 Local CLI (Phase 0, keep forever)

```
pnpm sieve diff --base main --head HEAD --config .jev.yml
pnpm sieve file --config .jev.yml --dossier research/fixtures/prs/auth-no-tests.json
pnpm sieve eval
pnpm sieve doctor
```

`doctor` checks: config parses, key present (or mock), a sample call works.

### 6.2 GitHub Action

```yaml
# .github/workflows/pr-sieve.yml
name: pr-sieve
on:
  pull_request:
    types: [opened, synchronize, reopened, edited]
jobs:
  sieve:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
      checks: write
    steps:
      - uses: actions/checkout@v5
        with:
          fetch-depth: 0
          persist-credentials: false
      - uses: <owner>/pr-sieve@<pinned-sha>
        with:
          typesafe-api-key: ${{ secrets.TYPESAFE_API_KEY }}
          config: .jev.yml
          fail-on: gate
          comment: sticky
```

Action steps internally:

1. Resolve base/head SHAs from the event
2. Load policy from base `.jev.yml` (fallback documented)
3. Run deterministic preflight
4. Build dossier file on disk
5. One `systemOne` call (all enabled Jev rules)
6. Engine → findings
7. Upsert Check Run + sticky comment
8. Exit 1 only when a `on: fail` finding fired and `fail-on` says so

### 6.3 Comment shape (lock this)

```markdown
<!-- pr-sieve -->
## pr-sieve

| Rule | Answer | Gate | Action |
|---|---|---|---|
| `touches_auth` | noul 0.91 | ≥ 0.75 | fail |
| `missing_tests` | noul 0.22 | ≥ 0.80 | — |
| `changelog` | noul 0.04 | comment ≥ 0.70 | — |

Policy: `.jev.yml` @ `abc1234` · model `jev-1.x` · 412ms · truncated_diff=true
```

No paragraph above the table except a one-line status (`1 failing gate`). No “consider adding tests because…”.

---

## 7. `.jev.yml` schema (the product)

Validate with Zod. Reject unknown keys in MVP? **No** — ignore unknown keys so we can add fields later. Reject wrong types.

```yaml
version: 1

ignore_paths:
  - "pnpm-lock.yaml"
  - "**/*.snap"
  - "dist/**"

# Deterministic preflight (no Jev)
preflight:
  max_files: 80
  max_diff_chars: 12000
  secret_regexes:
    - "AKIA[0-9A-Z]{16}"
    - "-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----"
  test_path_globs:
    - "**/*.{test,spec}.*"
    - "**/__tests__/**"
  changelog_paths:
    - "CHANGELOG.md"
    - "changelog.md"

builtin:
  touches_auth:
    on: fail
    threshold: 0.75
    paths: ["**/auth/**", "**/*auth*.*", "**/middleware/**"]
  missing_tests:
    on: fail
    threshold: 0.80
  changelog:
    on: comment
    threshold: 0.70
  looks_like_secret:
    on: fail
    threshold: 0.85
  change_kind:
    on: comment
    # Choice, not Noul; see pack

# User-defined Nouls. This is the extension point.
rules:
  - id: weakens_tests
    on: fail
    threshold: 0.80
    ask: "This diff weakens or deletes tests rather than adding coverage for the behavior it changes."
  - id: scope_creep
    on: comment
    threshold: 0.75
    ask: "This PR mixes an unrelated refactor or extra feature into the stated title/body."
  - id: claimed_refactor
    on: fail
    threshold: 0.80
    title_matches: "(?i)refactor"
    ask: "Despite the title, this diff changes externally visible behavior."
```

**Rule object**

```ts
type Rule = {
  id: string;                          // slug, unique
  on: "fail" | "comment" | "ignore";
  threshold: number;                   // noul or score cutoff
  ask: string;                         // Noul instructions (user-authored)
  paths?: string[];                    // if set, only attach this Noul when a changed path matches
  not_paths?: string[];                // skip if every changed file matches these
  title_matches?: string;              // JS regex; skip rule if title does not match
  type?: "noul" | "choice" | "score";  // default noul
  options?: Record<string, string>;    // required for choice
  levels?: string[];                   // required for score
};
```

Builtin rules are just default `rules` entries the user can override by `id`.

If `paths` is set and no changed file matches, **do not send that question** (saves noise and false positives). Still list it in the comment as `skipped (paths)`.

Cap user rules at **12 Jev questions per PR** in MVP. If they add more, run the first 12 and warn. (Jev parallel questions are cheap; the cap is for state quality and comment readability.)

---

## 8. Question packs

### 8.1 Dossier (`state`)

```ts
{
  surface: "pr",
  title: string,
  body: string,                    // truncated 1k
  author_association: string,      // OWNER | MEMBER | CONTRIBUTOR | FIRST_TIME | ...
  files: { path, status, additions, deletions }[],
  path_tags: string[],             // e.g. ["auth", "tests", "ci", "docs"]
  preflight: {
    secret_regex_hits: { path, pattern_id }[],
    has_test_file_change: boolean,
    has_changelog_change: boolean,
    file_count: number,
    truncated: boolean
  },
  diff: string                     // truncated unified diff of non-ignored files
}
```

Path tags are computed in code from builtin globs + `rules[].paths`. Do not make Jev infer the folder layout from nothing.

Redact secret-shaped substrings in `diff` and `body` before send.

### 8.2 Builtin pack `pr.v1`

Always include these *when enabled* in one `systemOne` call, together with user `rules`.

```ts
import { choice, noul, score } from "@typesafe-ai/sdk";

export function builtinQuestions(enabled: Set<string>) {
  const q: Record<string, unknown> = {};
  if (enabled.has("looks_like_secret")) {
    q.looks_like_secret = noul(
      "This change introduces or exposes a live credential, private key, or access token — not a placeholder or example.",
    );
  }
  if (enabled.has("missing_tests")) {
    q.missing_tests = noul(
      "The behavior change in this diff needed a test change, and the diff does not include an adequate one.",
    );
  }
  if (enabled.has("changelog")) {
    q.changelog = noul(
      "This is a user-facing or API-facing change that should be recorded in the changelog, and the changelog was not updated.",
    );
  }
  if (enabled.has("touches_auth")) {
    q.touches_auth = noul(
      "This change affects authentication, authorization, session handling, or access control — including middleware and permission checks.",
    );
  }
  if (enabled.has("change_kind")) {
    q.change_kind = choice("What is the primary nature of this PR?", {
      feature: "Adds user-visible or API behavior.",
      fix: "Corrects existing behavior.",
      refactor: "Restructures code without intending behavior change.",
      chore: "Deps, CI, docs-only, formatting.",
      mixed: "More than one of the above in a way that should be split.",
    });
  }
  return q;
}
```

User rules become extra `noul(rule.ask)` keyed by `rule.id`.

### 8.3 Engine

Pure function. Unit-test without a key.

```
preflight.secret_regex_hits → finding looks_like_secret (decided_by: rules) if builtin enabled
for each Jev noul:
  if skipped(paths) → skip
  if value >= threshold:
    emit finding { id, value, on, decided_by: "jev" }
for change_kind:
  if choice == "mixed" and confidence >= 0.55 and on != ignore:
    emit comment finding
check conclusion:
  fail if any emitted finding has on == "fail" and FAIL_ON != never
```

Do **not** fail merely because `touches_auth` is high. That Noul means “this PR is about auth,” which is often legitimate. Default `touches_auth.on` may be `comment` *or* `fail` — the example `.jev.yml` can `fail` only when combined in a later phase. For MVP keep it as a **label + comment**, and let the user set `on: fail` if they want auth PRs blocked pending human review.

Wait — the original idea said fail below confidence threshold. Interpret as:

- A **gate rule** fails the check when the noul is high *and* `on: fail`.
- Low Jev **confidence** on a Choice (change_kind) → comment `uncertain`, do not fail.

Put that in the example config comments so the user does not think every auth PR is a violation.

Recommended example defaults:

| id | on | meaning |
|---|---|---|
| looks_like_secret | fail | real credential in the diff |
| missing_tests | fail | behavior change, no tests |
| weakens_tests | fail | user rule |
| changelog | comment | docs hygiene |
| touches_auth | comment | routing signal for reviewers |
| change_kind | comment | mixed/refactor visibility |
| scope_creep | comment | user rule |

---

## 9. Build phases

### Phase 0 — Engine + CLI

- Repo layout below
- YAML schema + Zod
- Dossier builder from `git diff --name-status` + `git diff` (works locally)
- Packs + engine
- Mock mode `SIEVE_MOCK=1`
- `sieve eval` against fixtures
- One live `systemOne` saved

**Exit:** `pnpm sieve eval` prints a table. Gold bar in §10.

### Phase 1 — Action

- `action.yml` + bundled dist
- Example workflow + example `.jev.yml`
- Check Run + sticky comment
- Fork-PR skip path
- Read policy from base ref
- Redaction + truncation

**Exit:** In a throwaway repo, open a PR that adds `const key = "AKIA..."`, see fail. Open a PR that adds a feature without tests, see `missing_tests` fire. Open a docs-only PR, see success / changelog skip.

### Phase 2 — Packaging

- README: 10-minute setup, threat model, what we are not
- Pin-SHA instructions
- `sieve doctor`
- License MIT
- CI on *this* repo that runs `sieve eval` (mock) on every PR

**Exit:** A stranger can copy two files and get a green or red check.

### Phase 3 — only if the human asks

- Path-scoped markdown rule files like the 370-rule linter
- Reviewer team routing (`CODEOWNERS`-aware comment)
- `workflow_run` pattern so fork PRs get a second privileged job
- SARIF upload
- GitLab CI adapter

---

## 10. Evaluation

`research/fixtures/prs/*.json` — each is a dossier + expected findings.

| id | Expect |
|---|---|
| `secret-akia` | fail `looks_like_secret` via **rules** (no Jev required) |
| `secret-placeholder` | no fail (example `sk-ant-xxxxxxxx`) |
| `feat-no-tests` | fail or comment `missing_tests` (gold: fail at default 0.80 — if Jev undershoots, tune ask text) |
| `feat-with-tests` | no `missing_tests` |
| `docs-only` | success, changelog skipped or low |
| `auth-middleware` | `touches_auth` high, comment not fail (default) |
| `changelog-missing-api` | `changelog` comment |
| `mixed-refactor-plus-feature` | `change_kind=mixed` or `scope_creep` |
| `lockfile-only` | success, truncated/ignored |
| `weakens-tests` | fail user rule |
| `huge-diff-truncated` | still classifies from path list; `truncated=true` in comment |

Gold bar: ≥ 16 fixtures, **exact match on whether the check fails** ≥ 85% on `gold` items. Rules-layer fixtures must be 100%.

Also unit-test the engine with mocked answers.

---

## 11. Repo layout

```
pr-sieve/
  AGENT_HANDOFF.md
  NOTES.md
  README.md
  action.yml
  package.json
  tsconfig.json
  src/
    main.ts                 # Action entry
    cli.ts
    jev/client.ts
    dossier.ts              # git + redact + truncate
    policy/schema.ts
    policy/load.ts
    packs/pr.v1.ts
    engine.ts
    github/checks.ts
    github/comment.ts
    log.ts
  examples/
    pr-sieve.yml
    jev.yml
  research/
    FINDINGS.md
    EVAL.md
    fixtures/prs/
    sample-jev-response.json
  tests/
    engine.test.ts
    policy.test.ts
    dossier.test.ts
  dist/                     # bundled Action
```

Package name: `pr-sieve` or `@scope/pr-sieve`. Do not name it `jev-review` or `check-risk`.

---

## 12. Deliverables to hand back to the human

1. Working Action + example workflow + example `.jev.yml`
2. CLI that classifies a local `git diff`
3. `research/FINDINGS.md` and `research/EVAL.md`
4. Known misses: 5 PRs it gets wrong and whether the fix is rule wording or engine
5. Cost sketch: tokens × fixture, extrapolated to “20 PRs/day”
6. Threat-model paragraph: what a malicious PR can and cannot do
7. One paragraph on what you did **not** build

---

## 13. Implementation notes

**action.yml sketch**

```yaml
name: pr-sieve
description: Semantic PR gate powered by TypeSafe Jev. Policy in .jev.yml. No review essays.
inputs:
  typesafe-api-key:
    required: true
  config:
    default: .jev.yml
  fail-on:
    default: gate
  comment:
    default: sticky
  model:
    default: jev-latest
runs:
  using: node20
  main: dist/index.js
```

**Check Run.** Create/update with `conclusion: success | failure | neutral` and a short output summary (the same table). Required-status-checks should point at this job name.

**Sticky comment.** Search issue comments for `<!-- pr-sieve -->`. Update if found, else create. Delete the comment when there are zero findings and `comment: sticky` — or leave a one-line “clean” update. Pick one and document it. Prefer leaving the clean update so people see the check ran.

**Base policy.** 

```
git show ${{ github.event.pull_request.base.sha }}:.jev.yml
```

If that fails, try the checked-out file and mark `policy_source: head` in the comment so reviewers know the PR could have edited the gate.

**Redaction** before Jev and before logs: AWS key, private key armor, GitHub PAT, Slack/Discord tokens, `TYPESAFE_API_KEY=...`.

**Idempotency.** Re-runs on `synchronize` overwrite the same Check Run and comment. No comment spam.

---

## 14. First commands for the agent

```text
1. Create the repo layout.
2. Stub research/FINDINGS.md for every checkbox in §5.
3. Implement schema + engine + CLI. No Action yet.
4. Write ≥16 PR fixtures.
5. Run one live systemOne call. Save raw JSON.
6. Run eval. Tune builtin `ask` text until gold bars are met.
7. Only then bundle the Action and write the example workflow.
```

If `TYPESAFE_API_KEY` is missing, stop after mocked engine tests and write what you need from the human. Do not invent EVAL numbers.

---

## 15. Definition of done (MVP = end of Phase 2)

- [ ] Example workflow uses `pull_request` only, `persist-credentials: false`, least permissions
- [ ] `.jev.yml` drives user Nouls; builtin pack covers secrets / tests / changelog / auth / change-kind
- [ ] Deterministic secret regex fails without calling Jev
- [ ] Sticky comment is a table, not an essay
- [ ] Fork PR without secrets → `neutral` skip, not a hard fail
- [ ] TypeSafe outage → `neutral`, not merge-blocking
- [ ] Gold eval bar met or misses documented
- [ ] README names check-risk / jev-review as different products
- [ ] No `pull_request_target`, no install of PR dependencies, no suggested-code comments

Phase 3 is extra credit, not DoD.

---

## 16. Questions to ask the human only if blocked

1. TypeSafe API key available?
2. GitHub org/user that should own the Action repo?
3. Should `missing_tests` default to `fail` or `comment` while calibrating?
4. Public repo (fork PRs matter) or private only?
5. Preferred name: `pr-sieve` vs something else?

Do not wait on a Marketplace listing, badge, or SARIF.

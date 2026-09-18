# Research findings

Sources checked 2026-09-18. Live docs win over the handoff; diffs are in `NOTES.md`.

## TypeSafe

### JS SDK `systemOne` + `noul` / `choice` / `score`

- Package: [`@typesafe-ai/sdk`](https://www.npmjs.com/package/@typesafe-ai/sdk) (repo [`typesafe-ai/typesafe-sdk-js`](https://github.com/typesafe-ai/typesafe-sdk-js), types at v0.6.0).
- Node ≥ 20. Client: `new TypeSafeClient()` reads `TYPESAFE_API_KEY`. `client.systemOne({ state, questions, model? })`.
- Builders: `noul(instructions, criteria?)`, `choice(instructions, criteriaMap)`, `score(instructions, levels[])`.
- Default model `jev-latest` (alias of `jev-1.13.0`). Endpoint `POST https://api.typesafe.ai/v1/systemone`.
- One request, many questions, evaluated in parallel against the same `state`. Empty `questions` is a client error — we must not call if every rule was skipped.
- Errors we map to **sieve degraded**: `RateLimitError` (429), `InternalServerError` (5xx), `APITimeoutError`, `APIConnectionError`. Default timeout 10s; SDK retries 408/429/5xx.

### Semantic code linting (use-case map)

From [use-case map](https://docs.typesafe.ai/concepts/use-case-map):

> Use Jev queries to add automated semantic lints to code and writing. Define checks for your team's coding conventions and writing guidelines. Run these checks in CI and flag violations for review.

That is this product: policy-as-code lints, not a reviewer persona.

### Live call

**Done.** `pnpm sieve doctor` against `jev-1.13.0`: 354ms, 308 input tokens, 20 output. Payload: `research/sample-jev-response.json`. Live fixture eval: `pnpm sieve eval --live` → 18/18 gold fail-match (see `EVAL.md`).

### Noul = P(true); confidence?

Yes: `noul` is P(yes) in `[0, 1]`. **Noul answers do not include `confidence`.** Choice and Score do (`confidence` plus `probabilities`). Engine: Noul gates on the probability; `change_kind` mixed/uncertain uses Choice `confidence` (cutoff 0.55).

## GitHub Actions

### `action.yml` + bundling

- Metadata: `runs.using: node20` (still valid; tutorial default is `node24` — see `NOTES.md`) and `main: dist/index.js`.
- Bundle with `@vercel/ncc` so consumers do not install our dependencies.
- Inputs: `typesafe-api-key` (required for same-repo), `config`, `fail-on`, `comment`, `model`, `github-token` (default `${{ github.token }}`).
- Do **not** set the dossier/diff as an Action output (Windows/Linux ARG_MAX). Write a file under `RUNNER_TEMP`.

### Check Runs vs job conclusion

- Job conclusion is the required-status-check that always works (`core.setFailed` / exit 0).
- Named Check Run `pr-sieve` via `POST /repos/{owner}/{repo}/check-runs` with `conclusion: success | failure | neutral`. Needs `checks: write`. `GITHUB_TOKEN` is an app installation token, so this is allowed on same-repo PRs. Forks: token is read-only — skip the API write, keep job green for skip/degrade.
- REST docs say only GitHub Apps can *create* check runs; Actions `GITHUB_TOKEN` counts.

### Sticky comment

- Issue comments on the PR (`issues.listComments` / `createComment` / `updateComment`).
- Find `<!-- pr-sieve -->`, update in place. If none, create.
- Clean run: **leave a one-line “clean” update** (handoff preference) so reviewers see the check ran. `comment: never` skips posting. `comment: always` posts even when empty findings (same table). `comment: sticky` is the default.

### `pull_request` secrets on forks

Documented: Actions secrets are **not** passed to `pull_request` from a fork (empty string). `GITHUB_TOKEN` is read-only. Behavior: Check Run `neutral`, “sieve skipped: no key on fork PR”, do not fail, do not log missing key as a product error.

Same-repo PR with empty key: **job setup failure** (misconfigured workflow).

### Pwn-request / `pull_request_target`

[Workflow execution protections GA 2026-09-17](https://github.blog/changelog/2026-09-17-workflow-execution-protections-in-github-actions-generally-available/): public repos get a default rule that **disables `pull_request_target`**. Evaluate mode now; enforcement 2026-11-02. We never ship or recommend that trigger. Later fork-with-secrets path is `workflow_run` only (Phase 3).

### PR diff, safely

1. `actions/checkout@v5` with `fetch-depth: 0`, `persist-credentials: false`.
2. `git diff --unified=3 ${base.sha}...${head.sha}` (triple-dot, merge-base).
3. Fallback: Pulls `listFiles` (`patch` field; max 3000 files, patches often omitted).
4. Write dossier JSON to disk. Never as an output.

## Competitors

### moezubair/check-risk

Risk scorer (points → HIGH/MED/CRITICAL, reviewers, required checks). Closest cousin. Stolen stance, not product:

> The example checks out the base commit and fetches the PR head as data. It never runs PR code or installs PR dependencies. Do not run an untrusted PR's local `./action` with API secrets.

Rewritten in our README. Also: policy from base SHA; fork PRs without secrets → incomplete, not a secret leak; reasons from policy templates; one batched Jev request.

### thiago-ss/jev-review — five things we will not copy

1. Autonomous approval gates / merge policy.
2. GitHub App that writes approvals and reviewer requests.
3. Generated “structured explanation” routed to trusted owners.
4. Multi-perspective review x-ray (correctness/security/verification essays).
5. Calibration-driven auto-approve.

### devagrawal09/jev-review — five things we will not copy

1. Local dashboard UI.
2. Staged multi-call review workflow (file profiles → evidence → mechanism → severity → routing).
3. Whole-codebase scan mode.
4. “Review prompts” as findings rather than rule hits.
5. A fourth surface (dashboard server on 127.0.0.1).

### Patrick Desjardins rule files (optional)

Frontmatter `applies_to` ≈ our `paths:`. We did not import the 370-rule markdown format (Phase 3).

## Fixtures

18 synthetic PRs in `research/fixtures/prs/*.json` (dossier + mocked answers + expected fail). See `research/EVAL.md`.

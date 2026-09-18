# NOTES — spec vs live docs

Live TypeSafe and GitHub Actions docs win when they disagree with `github-action-pr-gate-handoff.md`.

## TypeSafe

- JS SDK is `@typesafe-ai/sdk` (`TypeSafeClient`, `systemOne`, helpers `noul` / `choice` / `score`). Default model `jev-latest` → `jev-1.13.0`.
- **Noul is P(yes) in `noul` (0–1). It does not carry `confidence`.** Confidence exists only on Choice and Score answers. The handoff’s “whether Noul also carries confidence” is answered: no. Engine thresholds Noul on the probability itself; Choice uncertainty uses `confidence`.
- Default client timeout is 10s; retries cover 408/429/5xx, connection errors, and timeouts (`RateLimitError`, `InternalServerError`, `APITimeoutError`, `APIConnectionError`).
- Price (docs, Jev 1.13): **$0.042 / Mtok input**; output tokens free. Not measured on a live call in this repo (no `TYPESAFE_API_KEY`).
- Semantic code linting is an official use-case-map item: CI checks defined as team conventions, not generated review prose.

## GitHub Actions

- Current JS-action tutorial uses `runs.using: node24` and Rollup. `node20` is still a documented runtime. We keep **`node20` + `@vercel/ncc`** as the handoff stack (ncc is listed as “or equivalent”).
- Tutorial checkout is `actions/checkout@v6`. Handoff example uses `@v5`. Example workflow pins **`actions/checkout@v5`** with `persist-credentials: false` and `fetch-depth: 0`; bump is a later chore.
- **Check Runs API:** creating/updating check runs is a GitHub App capability. `GITHUB_TOKEN` in Actions is an installation token; `permissions: checks: write` is the documented grant to create a check run. We still fail/succeed the **job** (`core.setFailed` / exit 0) so required-status-checks can target the job if the extra named run cannot be created (forks, 403).
- Fork `pull_request` workflows: Actions secrets are empty strings; `GITHUB_TOKEN` is read-only. Named check-run + sticky comment may be unwritable; job exit 0 + “skipped” is the fail-open path.
- `pull_request_target` is being default-disabled on public repos (evaluate mode now; enforcement 2026-11-02). We never recommend it. `workflow_run` is the only documented later path for fork-with-secrets.
- PR file list API: max 3000 files; `patch` is often missing on large files. Primary dossier source is **`git diff --unified=3 <base>...<head>`** after checkout. Never put the diff in an Action output.

## Handoff internal conflict (resolved)

§7 example YAML sets `touches_auth.on: fail`. §8.3 says MVP default is **comment** (auth is a routing label, not a violation). Example `.jev.yml` uses **comment**.

## Not done here

- Live `systemOne` call and `research/sample-jev-response.json` from the API: blocked on `TYPESAFE_API_KEY`.
- Dependabot PRs are same-repo but do not receive Actions secrets unless the key is copied to Dependabot secrets; they will hit the “same-repo, no key” setup failure. Documented in the README.

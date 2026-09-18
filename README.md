# pr-sieve

A CI check that treats `.jev.yml` as a **semantic linter**. Each rule is a typed TypeSafe Jev question (Noul / Choice / Score) about *this PR*. The Action fails or comments from those numbers. It is not a review bot.

Closest cousin is [check-risk](https://github.com/moezubair/check-risk), which scores *risk*. We evaluate *your rules*. [jev-review](https://github.com/thiago-ss/jev-review) and [devagrawal09/jev-review](https://github.com/devagrawal09/jev-review) write reviews, dashboards, or approval gates. We do not.

## Ten-minute setup

1. Copy [`examples/jev.yml`](examples/jev.yml) to `.jev.yml` in the repo you want to gate.
2. Copy [`examples/pr-sieve.yml`](examples/pr-sieve.yml) to `.github/workflows/pr-sieve.yml`.
3. Replace the pin in `examples/pr-sieve.yml` with a **commit SHA** from [Thestral12/pr-sieve](https://github.com/Thestral12/pr-sieve) (not a floating tag).
4. Add `TYPESAFE_API_KEY` as a repository Actions secret ([console](https://console.typesafe.ai/settings/keys)).
5. Open a PR. You should get a Check Run named `pr-sieve` and a sticky comment that is a table, not an essay.

```yaml
# .github/workflows/pr-sieve.yml (excerpt)
on:
  pull_request:
    types: [opened, synchronize, reopened, edited]
permissions:
  contents: read
  pull-requests: write
  checks: write
steps:
  - uses: actions/checkout@v5
    with:
      fetch-depth: 0
      persist-credentials: false
  - uses: Thestral12/pr-sieve@ea8e3559e7407534f4296cf5a83f79d8964784bd
    with:
      typesafe-api-key: ${{ secrets.TYPESAFE_API_KEY }}
```

The example workflow uses `pull_request` only. It never uses `pull_request_target`. Checkout is data: `persist-credentials: false`. The Action does not install the PR’s dependencies and must not be invoked as `uses: ./` from an untrusted PR tree with secrets in scope.

## What it does

1. Load `.jev.yml` from the **base** ref (`git show <base_sha>:.jev.yml`) so a PR cannot rewrite the gate that judges it.
2. Deterministic preflight in code (secret regexes, test/changelog paths, counts). A secret regex hit fails **without calling Jev**.
3. Build a bounded dossier (path list + truncated diff, ~12k chars). Write it to a file. Never as an Action output.
4. One `systemOne` call: builtin pack plus your `rules[]`, capped at 12 questions. Path-gated rules that match nothing are `skipped (paths)`.
5. Engine: emit a finding when a Noul is ≥ threshold. Fail the check only if some finding has `on: fail` and `fail-on` is not `never`. `touches_auth` defaults to **comment**. `change_kind=mixed` is comment-only.
6. Named Check Run `pr-sieve` plus a sticky comment (`<!-- pr-sieve -->`) updated in place. Clean runs still get a one-line `clean` update.

Row reasons are templates, e.g. `` `touches_auth` 0.91 ≥ 0.75 → comment ``. No generated prose.

## Local CLI

```
pnpm sieve diff --base main --head HEAD --config .jev.yml
pnpm sieve file --config .jev.yml --dossier research/fixtures/prs/feat-no-tests.json
pnpm sieve eval
pnpm sieve doctor
```

`SIEVE_MOCK=1` skips live Jev (rules-layer + fixture answers only). `pnpm sieve eval` is the mocked gold bar.

## Threat model

A malicious PR can change files, titles, and the head `.jev.yml`. It cannot change the policy that judges it if `.jev.yml` exists on the base ref. It cannot run its own `package.json` install or Action entry through this workflow: we checkout with credentials off, we never `npm install` the PR, and the published Action is a pre-bundled `dist/` from *this* repo. Fork `pull_request` workflows do not receive `TYPESAFE_API_KEY`; we post a **neutral** skip instead of failing the PR or logging a missing key as a product error. `GITHUB_TOKEN` on forks is read-only, so comment/check writes may be skipped; the job still exits 0.

What a malicious PR cannot do with this Action: exfiltrate the TypeSafe key on `pull_request` from a fork, execute code from the PR as part of the sieve, or turn the sticky comment into a generated review.

Do not “fix” fork coverage by switching to `pull_request_target`. GitHub is default-disabling that trigger on public repos. The only later path for fork-with-secrets is a trusted `workflow_run` job (not in MVP).

Same-repo PRs with no key fail **job setup** (misconfigured workflow). Dependabot is same-repo and does not see Actions secrets unless you copy the key to Dependabot secrets.

TypeSafe 429 / 5xx / timeout → Check Run `neutral`, “sieve degraded”. Vendor outage does not block merge.

## Pin a SHA

After you push a release commit:

```
git rev-parse HEAD
```

Put that SHA in `uses:`. Tags move; SHAs do not.

## What we did not build

Generated review comments, suggested patches, auto-approve / auto-merge, reviewer assignment via the reviews API, a dashboard, SARIF, GitLab, path-scoped markdown rule files, or a `workflow_run` privileged second job. Jev is not a secret scanner: regexes are. Jev asks whether a change *looks like* it handles secrets carelessly.

## License

MIT

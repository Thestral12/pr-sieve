# pr-sieve

A GitHub Action that treats `.jev.yml` as a **semantic linter** for pull requests.

Each rule is a typed [TypeSafe](https://typesafe.ai) Jev question (Noul / Choice / Score). The check **fails, comments, or passes** from those numbers. It does not write reviews, suggest patches, or approve anything.

Closest cousin: [check-risk](https://github.com/moezubair/check-risk) (risk score). Not [jev-review](https://github.com/thiago-ss/jev-review) (review / approve / dashboard).

## Use it

1. Copy [`examples/jev.yml`](examples/jev.yml) to `.jev.yml`.
2. Copy [`examples/pr-sieve.yml`](examples/pr-sieve.yml) to `.github/workflows/pr-sieve.yml`.
3. Add `TYPESAFE_API_KEY` as a repo Actions secret ([console](https://console.typesafe.ai/settings/keys)).
4. Open a PR. You get a Check Run named `pr-sieve` and a sticky table comment.

```yaml
on:
  pull_request:
    types: [opened, synchronize, reopened, edited]
permissions:
  contents: read
  pull-requests: write
  checks: write
jobs:
  sieve:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
        with:
          fetch-depth: 0
          persist-credentials: false
      - uses: Thestral12/pr-sieve@ea8e3559e7407534f4296cf5a83f79d8964784bd
        with:
          typesafe-api-key: ${{ secrets.TYPESAFE_API_KEY }}
```

Pin a **commit SHA**, not a tag. Tags move.

`pull_request` only. Never `pull_request_target`. Do not `uses: ./` from an untrusted PR with secrets in scope.

## What you get

```
<!-- pr-sieve -->
## pr-sieve

1 failing gate

| Rule | Answer | Gate | Action |
|---|---|---|---|
| `looks_like_secret` | regex hit | ≥ 0.85 | fail |
| `missing_tests` | noul 0.87 | ≥ 0.80 | fail |
| `touches_auth` | noul 0.91 | comment ≥ 0.75 | comment |
| `change_kind` | mixed 0.72 | comment ≥ 0.55 conf | comment |
```

Reasons are templates (`` `missing_tests` 0.87 ≥ 0.80 → fail ``), not generated prose. A clean run still posts `clean`.

Policy is read from the **base** ref, so a PR cannot rewrite the gate that judges it. Secret-shaped strings (AWS `AKIA…`, private-key armor) fail in **code**, with no Jev call. Everything else is one `systemOne` batch, capped at 12 questions.

`touches_auth` comments by default. `change_kind: mixed` is comment-only. Fork PRs without a key skip (`neutral`). TypeSafe 429/5xx/timeout → `neutral`, “sieve degraded”. Same-repo missing key → job setup failure.

## Local

```
pnpm install
pnpm test
pnpm sieve eval              # mocked gold bar
pnpm sieve eval --live       # real Jev (loads .env)
pnpm sieve doctor
pnpm sieve diff --base main --head HEAD --config .jev.yml
```

`.env` is gitignored. Copy `.env.example`. `SIEVE_MOCK=1` skips live Jev.

## What this does not do

Generated reviews, suggested patches, auto-approve, reviewer assignment, a dashboard, or SARIF. Regexes catch live-looking secrets. Jev only asks whether a change *looks like* it handles secrets carelessly.

## License

MIT

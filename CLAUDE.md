# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```
pnpm install
pnpm typecheck
pnpm test                 # vitest
pnpm test -- tests/engine.test.ts
pnpm build                # ncc → dist/ (Action) and dist/cli/
pnpm sieve diff --base main --head HEAD --config .jev.yml
pnpm sieve file --config .jev.yml --dossier research/fixtures/prs/feat-no-tests.json
pnpm sieve eval           # mocked gold bar (fixture answers)
pnpm sieve eval --live    # real Jev; loads .env / TYPESAFE_API_KEY
pnpm sieve doctor         # config parse + live ping; writes research/sample-jev-response.json
```

CLI loads `.env` if present (gitignored). Without `TYPESAFE_API_KEY`, stop after mocked engine tests. Do not invent live EVAL numbers.

## What this is

`pr-sieve` is a GitHub JavaScript Action plus a local CLI. `.jev.yml` is a semantic linter: each rule is a typed TypeSafe Jev question (Noul / Choice / Score). The check passes, fails, or comments from those numbers. It is a **linter-shaped gate, not a review bot**. No generated review prose, suggested edits, auto-approval, or dashboard.

Stack: Node ≥ 20, strict TypeScript, `@typesafe-ai/sdk`, Zod + `yaml`, `@actions/core` / `@actions/github`, bundled with ncc to `dist/`.

When live TypeSafe / GitHub Actions docs disagree with `github-action-pr-gate-handoff.md`, the docs win; record the difference in `NOTES.md`.

## Architecture

Same core from the Action (`src/main.ts`) and the CLI (`src/cli.ts`) via `src/pipeline.ts`:

1. **Policy** (`policy/load.ts`, `policy/schema.ts`): `.jev.yml` from the **base** ref. Fallback head (`policy_source: head`) then default pack. Zod ignores unknown keys, rejects wrong types. Builtin rules are default `rules` entries overridden by `id`.
2. **Preflight** in `dossier.ts`: secret regexes, test/changelog detection, counts, path tags. A secret regex hit fails **without calling Jev**.
3. **Dossier**: bounded state, ~12k chars, 1.5k/hunk, prefer added lines. Path list always kept. `ignore_paths` never enter. Lockfiles/binaries path-only. Secrets redacted before Jev and logs. Written to a file, never an Action output.
4. **Questions** (`packs/pr.v1.ts`): one `systemOne` call, cap 12. Path misses are `skipped (paths)`.
5. **Engine** (`engine.ts`): pure. Finding when value ≥ threshold. Fail only if some finding has `on: fail` and `FAIL_ON != never`. `change_kind == mixed` with confidence ≥ 0.55 → comment only. `touches_auth` defaults to comment. Noul has **no** `confidence` field (Choice/Score do).
6. **Output**: Check Run `pr-sieve` + sticky comment `<!-- pr-sieve -->`. Markdown table rendered in code. Clean run still gets a one-line `clean` update.

## Hard constraints

- No LLM-generated text. Reasons are templates: `` `touches_auth` 0.91 ≥ 0.75 → fail ``.
- Never run untrusted PR code. Example workflow: `pull_request` only, `persist-credentials: false`, permissions `contents: read`, `pull-requests: write`, `checks: write`.
- Fail-open: TypeSafe 429/5xx/timeout → `neutral` “sieve degraded”. Fork PR, no key → `neutral` skip. Same-repo, no key → job setup failure. Invalid config → `failure` + Zod path in the comment.
- `workflow_run` is the only fork-with-secrets path to document. Do not recommend `pull_request_target`.

## Eval / done

Fixtures: `research/fixtures/prs/*.json`. Gold: ≥ 85% exact match on whether the check fails. Rules-layer: 100%. Stop at Phase 2 unless asked for Phase 3.

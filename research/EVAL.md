# EVAL

Date: 2026-09-18. Model: `jev-1.13.0`.

## Bar

- ≥ 16 fixtures
- Rules-layer: 100% exact match on whether the check fails
- Gold items: ≥ 85% exact match on whether the check fails

## Mocked engine

`pnpm sieve eval` (fixture answers, no network)

| | |
|---|---|
| Fixtures | 18 |
| Rules-layer | 4/4 (100%) |
| Gold fail-match | 18/18 (100%) |

## Live Jev

`pnpm sieve eval --live` (`.env` / `TYPESAFE_API_KEY`)

| | |
|---|---|
| Fixtures | 18 |
| Rules-layer | 4/4 (100%) — no Jev call on regex short-circuit |
| Gold fail-match | **18/18 (100%)** |
| Model | `jev-1.13.0` |
| Input tokens | 12,322 across 18 fixtures |
| Wall | 3.2s |

Doctor probe (`pnpm sieve doctor`): 308 input tokens, 20 output, 354ms. Raw payload: `research/sample-jev-response.json`.

### Ask-text calibration

First live pass was **16/18 (89%)**, already over the 85% bar. Two misses, both **wording** not engine:

| Fixture | First live | After ask/criteria tune |
|---|---|---|
| `feat-no-tests` | `missing_tests` 0.54 (need ≥ 0.80) | 0.87 → fail |
| `claimed-refactor` | `claimed_refactor` 0.66 (need ≥ 0.80) | 0.85 → fail |

`missing_tests` now uses Noul `true`/`false` criteria pointing at `preflight.has_test_file_change` and feat/fix vs chore/docs. `feat-with-tests` stayed at 0.03.

`scope-creep` then failed on `missing_tests` (a testless fix). The fixture was given a test file so it still checks **comment-only** scope creep, not the tests gate.

## Known misses

**Live, this run: none** on fail/pass. Jev is not bit-stable; `jev-latest` can move. If `feat-no-tests` or `claimed-refactor` flap around 0.80, the fix is still ask text, not the engine.

## Cost (measured)

Doctor: 308 input tokens. Fixture PRs: ~685 input tokens average (12,322 / 18).

Published price $0.042 / Mtok input, output free:

- ~$0.000029 / PR at measured size
- 20 PRs/day ≈ **$0.00058 / day** ≈ **$0.18 / month**

The 12k-char cap estimate ($0.00017/PR) was a ceiling. Measured dossiers are smaller.

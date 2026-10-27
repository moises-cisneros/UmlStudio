# Issue 15: Internal room inference endpoint

Objective: Add a protected room-inference contract to the Python AI service without changing Cycle 1 endpoints.
Branch: `feat/15-internal-room-response` (original base `df23ac2`, fast-forwarded to `313eaea`). Delivery: `ask-on-risk`; chain strategy: `stacked-to-main`; push and PR creation remain human decisions. Runner: `uv run --no-project --python ../../.venv/bin/python -- python -m unittest discover -s test/unit` from `apps/ai-service`.

## Specs

- **S1** — Issue #15: "Add `POST /internal/v1/room/respond` (`mode`: `explain` | `change`, `requester`, `question`, `board`, `context`) → `{ text, diff | null, provider }`". Check both response shapes through the HTTP route.
- **S2** — Issue #15: "Add `complete_text` to `BaseAIAdapter` (at least Ollama and Gemini)". Check provider request/response mapping without live services.
- **S3** — Issue #15: "Require `X-Internal-Token`; the endpoint is not exposed to browsers". Check fail-closed behavior and browser-origin rejection without changing existing public CORS behavior.
- **S4** — Issue #15: "In `change` mode validate the diff before returning it". Check invalid diff rejection through the route.
- **S5** — Issue #15: "`unittest` with a stub adapter for both modes". Run focused unit tests and the AI-service suite.
- **S6** — Issue #15: "`401` without a valid token". Check missing, invalid, and unset-token cases.
- **S7** — Issue #15: "Public endpoints of cycle 1 (unchanged)." Check an existing public route and run the full applicable checks.

## Tasks

- [ ] **T1** (S2): Add plain-text completion to the base, Gemini, Ollama, and auto adapters, with focused provider-mapping tests. PR slice 1/2. Route: inline. Risk: item 3 (shared adapter contract). Status: implementation exists; adapter tests are separated and 3/3 focused tests pass. Commit: pending.
- [ ] **T2** (S1, S3-S7): Add the protected room-response endpoint, service, models/configuration, route/security/diff-validation tests, and architecture guidance. PR slice 2/2; depends on T1 and will be retargeted to `main` after T1 merges. Route: inline. Risk: item 2 (internal authentication). Status: implementation exists; commit pending.

## Log

- **L1** (2026-10-27) User request verbatim: "bien, aseguralo con mucho cuidado, tienes mi autorizacion para implementar esa issue".
- **L2** (2026-10-27) Prior constraint verbatim: "que no vuelva a pasar lo de subir sin haber pasado todos los builds, apruebo asignarme la #15, pero es peligrosa, porque no tenemos como probarla, tendremos que levantar una IA local e gcloud".
- **L3** (2026-10-27) Read-only evidence: issue #15 was OPEN and assigned to `SCANDAL9`; branch was created locally from `main` at `df23ac2`; no remote delivery is authorized. Existing public routes use `AIPipeline`; adapters currently only generate diffs. Offline tests can use a stub adapter and mocked HTTP providers. The endpoint must fail closed if the token is unset. Ollama/Gemini support must not make other adapter subclasses abstract.
- **L4** (2026-10-27) Test-first evidence: the initial seven focused tests were RED (missing route and `complete_text`); implementation made them GREEN. Added auto-provider and public-CORS regression tests; focused suite reached 9/9. Full Python suite passed 168 tests (7 skipped). Root format check, lint, build, codegen build, UI build, `test:all`, and `test:ai` passed before a later Python-only correction.
- **L5** (2026-10-27) Independent verification found no candidate-caused blockers and matched public `/health` and `/api/chat` CORS output with the base commit. Parent spot check found an empty diff could still yield a success message and a corrupted diff could leak provider content in a Pydantic warning. New tests observed RED for both, then GREEN after rejecting empty proposals and using error-on-warning serialization. Final suite and review remain pending.
- **L6** (2026-10-27) Post-correction checks passed: Python `unittest` 170 tests (7 skipped); `pnpm format:check`, `pnpm lint`, `pnpm build`, codegen build, UI build, `pnpm test:all`, and `pnpm test:ai`. Scoped independent recheck and parent spot check passed for the two corrected security cases. No live provider or GCP was needed.
- **L7** (2026-10-27) Authored change is approximately 466 added/deleted lines including 243 lines of focused tests and this task document. The default `ask-on-risk` delivery strategy requires a human chain-strategy decision before the work-unit commit. Commit, native review, push, and PR are pending; push and PR are not authorized.
- **L8** (2026-10-27) After PRs #51 and #50 were squash-merged, `origin/main` advanced to `313eaea`; the issue branch was fast-forwarded from `df23ac2` with no overlapping paths or conflicts, preserving all uncommitted issue #15 changes. Post-sync checks passed: AI-service unittest 170 (7 skipped), `pnpm format:check`, `pnpm lint`, `pnpm build`, `pnpm test:all` (core 402, server 99, codegen 19), `pnpm test:ai` (10), and webapp tests (125). The build emitted the existing Vite large-chunk advisory; it did not fail. Delivery strategy, commit, native review, push, and PR remain pending.
- **L9** (2026-10-27) User authorized the chosen slicing plan: "bien, hazlo, autorizo". Selected `stacked-to-main`: T1 adapter text completion is an independently safe first slice; T2 adds the protected endpoint and depends on T1. The current change is about 469 authored lines, so each PR must be checked to stay below the repository's 400-line guideline. Exact slice counts and boundaries must be recorded after separating adapter tests from route tests. No maintainer size exception is assumed; push and PR creation remain unapproved.
- **L10** (2026-10-27) Split the existing combined test module without changing assertions: adapter tests now live in `test_text_completion_adapters.py`, and endpoint/security tests remain in `test_internal_room_response.py`. Focused adapter tests passed 3/3 and endpoint tests passed 8/8; the full AI-service suite remains to be rerun after the split. No behavior was added or removed in this test-organization step.

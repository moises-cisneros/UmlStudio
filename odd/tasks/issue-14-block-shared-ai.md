# Issue #14: Block Shared-Mode AI

Objective: Prevent browser-to-AI service requests from shared diagrams while preserving individual-mode behavior.
Branch: `feat/14-block-shared-ai`; delivery: `feature-branch-chain`; test runner: pnpm.

## Specs

### S1 — Block the three shared-mode AI flows

- User scope: “Bloquear los 3 flujos compartidos”.
- Acceptance: shared diagrams do not make browser requests to the AI service from Agent chat/voice, the productivity AI audit, or image vision import. Individual-mode AI remains available.
- Checks: focused webapp tests for all three flows; webapp test suite, lint, format check, and build.

### S2 — Shared dock behavior

- User request: “prefiero que tambien oculte la pestaña Agent” and “que cambie automaticamente a Room”.
- Acceptance: hide Agent and select Room in shared mode; restore the prior individual tab when returning to individual mode without opening a dock that the user had closed.
- Checks: focused RightDockWorkspace tests and webapp suite.

### S3 — Productivity and vision confirmation

- User confirmation: “confirmo que no se ve desde productividad e importacion, no se puede usar\*, sigue con lo que falta, autorizo”.
- Acceptance: shared-mode productivity and vision entry points do not invoke the AI service; preserve their individual-mode behavior and non-AI functionality.
- Checks: focused productivity and import tests; webapp suite.

## Tasks

- T1 — S2; delegated; complete; commit `6f37e57` (`feat(webapp): switch shared dock to room`).
- T2 — S1, S3; delegated; implementation, focused/full checks, and independent verification complete; commit `2312001` (`fix(webapp): block shared-mode AI requests`).
  - Focused check: `pnpm --config.verify-deps-before-run=false --filter @umlstudio/webapp exec vitest run src/components/modals/ProductivityModal.test.tsx src/components/vision/VisionImportDialog.test.tsx src/hooks/useImportDiagramFile.test.tsx` — 21 passed.
  - Suite: `pnpm --filter @umlstudio/webapp test` — 135 passed. Independent candidate probes: 24 passed; baseline preservation probes: 21 passed.
  - Runtime harness: N/A; the affected browser-to-AI calls and preservation behavior are covered through mocked service tests.
  - Rollback boundary: revert `apps/webapp/src/components/modals/ProductivityModal.tsx` and its test, `apps/webapp/src/components/vision/VisionImportDialog.tsx` and its test, plus `apps/webapp/src/hooks/useImportDiagramFile.ts` and its test; retain T1 dock behavior in commit `6f37e57`.

## Log

- L1 — Original request: “Bloquear los 3 flujos compartidos”.
- L2 — Scope confirmation: “confirmo que no se ve desde productividad e importacion, no se puede usar\*, sigue con lo que falta, autorizo”.
- L3 — Delivery decision: user selected `feature-branch-chain`; remote operations remain unauthorized.
- L4 — Review decision: user declined review of the first work-unit candidate. Exact decline was validated. Required status re-entry succeeded after escalation and offered the same target as fresh; skip START because the user explicitly declined that candidate.
- L5 — Verification: focused candidate tests passed (21); the webapp suite passed (135); independent scratch verification passed the candidate probes (24) and baseline preservation probes (21 combined). Earlier full-feature lint, format check, and build passed; the build emitted a nonblocking large-chunk warning. No blockers were found.
- L6 — State before remote publication: T1 branch `feat/14-block-shared-ai-01-agent-dock` points to `6f37e57`; T2 commit `2312001` is on `feat/14-block-shared-ai`. The tracker ref is `feat/14-block-shared-ai-tracker` at the base commit. No remote access, push, PR, or merge had occurred at that point.
- L7 — After the user authorized “autorizo”, pushed the three issue #14 branches over HTTPS using the existing GitHub CLI authentication. Created draft PR #53 (`feat/14-block-shared-ai-01-agent-dock` → tracker; 204 changed lines) and draft PR #54 (`feat/14-block-shared-ai` → T1; 340 changed lines). No merge was performed. Both PRs' repository-guard checks passed. The CI workflow only triggers pull requests targeting `main`, so these child PRs do not run that workflow. Local full lint, format check, build, and test checks had passed before publishing; the build reported a nonblocking large-bundle warning. The tracker branch at `313eaea` is an ancestor of current `main` (`6bd4140`) with no commits ahead, so a tracker-to-main draft PR cannot be opened until the child work is integrated into the tracker branch.

# Issue 17: Room AI queue

Branch: `feat/17-room-ai-queue` · Delivery: `single-pr` · Tests: `pnpm --filter @umlstudio/server test`

## Specs

- S1: `RoomQueue`: FIFO per room, max 5 pending; `429` when full, enforced across instances.
- S2: Global semaphore `AI_MAX_CONCURRENCY`, coordinated across server instances through shared Redis.
- S3: 90 s timeout per inference; a timeout marks the message `failed` with the real cause. Preserve the concurrency limit: release the semaphore slot only after inference termination is confirmed, even if this can leave the queue waiting.
- S4: Expose queue position for `ai.status`; propagate `message.created`, `message.updated` and `ai.status` to clients connected to any instance. Include `policy.updated` for all browsers, as discussed for issue #27.
- S5: Tests use simulated inference and shared Redis; no real model is required.

## Tasks

- [x] T1 (S1, S5): atomic shared per-room queue and admission; inline; complete.
- [x] T2 (S2, S3, S5): shared inference coordination and failure handling; inline; complete.
- [x] T3 (S4, S5): cross-instance Room AI events; inline; complete.
- [x] T4 (S1–S5): integration verification and documentation; inline; complete.

## Log

- Final implementation/check status: T1–T4 complete. Repository checks passed after the RELEASE retry correction: `pnpm build`, `pnpm --filter @umlstudio/codegen run build`, `pnpm lint`, `pnpm format:check`, and `pnpm test:all` (541 tests: core 402, server 120, codegen 19). Independent verification passed the focused RELEASE retry test and 16 isolated dispatcher/retry/fencing tests.
- Scope correction: the earlier note that #17 was incomplete because no production inference worker drained the queue was incorrect. #17 provides the queue/dispatcher infrastructure with injectable inference; wiring the real Room AI orchestrator/inference is issue #19 and is not required to complete #17.
- Native review correction: lens `review-resilience` found that a transient Redis failure during RELEASE could permanently consume a slot. The dispatcher now retries the same token-fenced RELEASE with capped exponential backoff; inference is not repeated. A regression test observed RED before the fix and GREEN afterward. The one bounded correction is implemented; bound STATUS, targeted validation, and exact acknowledgement remain pending.
- Delivery remains pending: the current candidate's four-lens native review is in its correction lifecycle, not approved yet. No commit, push, or PR was made.

- The user authorized the confirmed-termination slot-leak fix. Regression tests observed RED then GREEN for persistence and publication failures. Dispatcher: 13 tests passed; full server: 119 tests passed, build and lint passed. Independent verification was unavailable because its assigned model was at capacity; the previous native review ended escalated and did not approve this candidate. Do not deliver yet.

- L1: “bien ya empecemos con el paso a paso de la Issue #17”
- User: “bien, puedes empezar con mucho cuidado”
- Baseline `bf950b5`: server suite 18 files / 99 tests passed. Existing chat history is capped and is not a safe queue. Cross-instance relay events are currently local only.
- T1 RED: `pnpm --filter @umlstudio/server test test/integration/cu-15-room-ai-routes.test.ts -t 'rejects the sixth'` failed as expected: sixth message returned 202, expected 429. Implementation and GREEN are pending.
- T1 WIP: atomic Redis queue admission and 429 implemented; focused route suite passed 11 tests after legacy initialization correction. Before that correction, full server suite passed 101 tests. Independent verifier reproduced a legacy-queue regression; correction passed its targeted recheck. No dequeue/worker exists yet: after five messages the room will remain full until remaining tasks are implemented. Not release-ready.
- After correction: server suite 18 files / 102 tests passed; server build passed. Independent verifier scratch copies were removed. Lint and full workspace builds remain pending.
- User: “ok, no me gusta que tras un pequeño cambio te detengas, ejecuta el plan completo, no me digas cosas obvias”
- User: “autorizo” — prioritize the global limit over releasing an unconfirmed inference slot after timeout.
- T3 WIP: Redis pub/sub fans Room AI events to local relays in both server configurations; cross-instance policy.updated WebSocket test passed. Independent verifier found no blocker for this partial event-bus delivery (18 tests in isolated probes), but did not verify downtime delivery or full-process shutdown. Redis Pub/Sub does not persist missed events.
- Post-T3 checks: server suite 19 files / 104 tests, server lint and server build passed. T2 and full issue verification remain pending; queue is still not consumed and must not be released.
- T2 WIP: added injectable dispatcher with Redis-coordinated claims, room exclusion, timeout failure and conservative slot retention; 4 focused tests, server lint and server build passed. It is not wired into production; #19 explicitly owns the inference orchestrator and integration. Further concurrency verification, recovery and full-suite checks remain pending.
- Added automatic room draining, queue-position events, AI_MAX_CONCURRENCY configuration, and safeguards for legacy queues, event ordering and bounded shutdown. Independent verifier reproduced active-message replay, stranded legacy queues, claim/shutdown race and stale idle events; targeted fixes and rechecks passed. A later bounded-shutdown verification passed. No production inference wiring exists; enabling the five-message limit currently leaves rooms full after five requests.
- Current checks: `pnpm build`, `pnpm --filter @umlstudio/codegen run build`, `pnpm lint`, `pnpm format:check` and `pnpm test:all` passed; 538 tests across core (402), server (117), codegen (19). No commit, push, or PR.
- Issue #19 explicitly integrates queue, context (#18), AI service, persisted answer, and events. Issue #17 remains incomplete/not safely releasable while admission is active but no production dispatcher drains the queue. The GitHub issue text still describes immediate timeout slot release; user approved holding it until termination is confirmed.
- Forecast: over 400 authored lines is possible; user previously expressed preference for one PR, so delivery is `single-pr`. No push or PR authorized.

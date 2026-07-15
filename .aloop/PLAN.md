# PLAN — deterministic Lumen transition handoff

## Milestone M1 — Evidence and diagnosis

- [x] `T1` Capture the current cold/warm transition and identify the invalid frame. Size S, effort high, deps none, parallel-ok false. Perf: measured focus-to-commit at 128.5–184.3 ms; split can precede the 180 ms punch-in end, while sampled timer completion for the 160 ms UI zoom-out arrived at 327.2–382.5 ms under load.
- [x] `T2` Obtain independent host/webview and optical-timing diagnoses. Size S, effort medium (ECONOMY ceiling), deps T1, parallel-ok true. Perf: both reviews preserve the existing optical stack; host review confirms CSS must own the first resized frame, while optical review retains the 60 ms host initiation window.

## Milestone M2 — Deterministic handoff

- [x] `T3` Implement a geometry-atomic visual latch and explicit transition phases. Size M, effort medium (xhigh deferred by ECONOMY band), deps T1/T2, parallel-ok false. Perf: one ephemeral style element; CSS owns the geometry cut and JS only acknowledges/cleans it.
- [x] `T4` Extend transition contracts, telemetry assertions, and architecture docs. Size S, effort low, deps T3, parallel-ok false. Perf: 14 focused tests pass in 255 ms; production frontend build succeeds.

## Milestone M3 — Proof and publication

- [ ] `T5` Build, install, and validate repeated cold/warm entries in real VS Code. Size M, effort medium, deps T3/T4, parallel-ok false. Perf: record animation and timing evidence.
- [ ] `T6` Publish the branch as a PR, run independent review, inspect thread-aware GitHub feedback, and address every actionable finding. Size S, effort low, deps T5, parallel-ok false.

# PLAN — deterministic Lumen transition handoff

## Milestone M1 — Evidence and diagnosis

- [x] `T1` Capture the current cold/warm transition and identify the invalid frame. Size S, effort high, deps none, parallel-ok false. Perf: measured focus-to-commit at 128.5–184.3 ms; split can precede the 180 ms punch-in end, while sampled timer completion for the 160 ms UI zoom-out arrived at 327.2–382.5 ms under load.
- [ ] `T2` Obtain independent host/webview and optical-timing diagnoses. Size S, effort medium (ECONOMY ceiling), deps T1, parallel-ok true. Perf: two read-only project threads are running; proposals must avoid extra boot I/O and frame-bound JS work.

## Milestone M2 — Deterministic handoff

- [ ] `T3` Implement a geometry-atomic visual latch and explicit transition phases. Size M, effort medium (xhigh deferred by ECONOMY band), deps T1/T2, parallel-ok false. Perf: CSS/style-layout handoff; no polling or per-frame allocation.
- [ ] `T4` Extend transition contracts, telemetry assertions, and architecture docs. Size S, effort low, deps T3, parallel-ok false. Perf: tests remain source-level and fast.

## Milestone M3 — Proof and publication

- [ ] `T5` Build, install, and validate repeated cold/warm entries in real VS Code. Size M, effort medium, deps T3/T4, parallel-ok false. Perf: record animation and timing evidence.
- [ ] `T6` Publish the branch as a PR, run independent review, inspect thread-aware GitHub feedback, and address every actionable finding. Size S, effort low, deps T5, parallel-ok false.

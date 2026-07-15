# PLAN — deterministic Lumen transition handoff

## Milestone M1 — Evidence and diagnosis

- [x] `T1` Capture the current cold/warm transition and identify the invalid frame. Size S, effort high, deps none, parallel-ok false. Perf: measured focus-to-commit at 128.5–184.3 ms; split can precede the 180 ms punch-in end, while sampled timer completion for the 160 ms UI zoom-out arrived at 327.2–382.5 ms under load.
- [x] `T2` Obtain independent host/webview and optical-timing diagnoses. Size S, effort medium (ECONOMY ceiling), deps T1, parallel-ok true. Perf: both reviews preserve the existing optical stack; the first review proposed a CSS geometry latch and optical review retained the existing punch-in/landing grammar.

## Milestone M2 — Deterministic handoff

- [x] `T3` Implement, then hostile-review, the geometry latch. Size M, effort medium, deps T1/T2, parallel-ok false. Review proved that CSS cannot prevent VS Code from recomposing an already-submitted stale webview surface.
- [x] `T4` Replace geometry authority with a token-correlated prepaint protocol: frozen intro-free route -> two safe paint opportunities -> host move -> next-render-frame landing -> settled ack. Size M, effort high, deps T3, parallel-ok false. Perf: 38 frontend contracts pass; frontend and extension compile.
- [x] `T5` Extend transition contracts, executable frame-scheduler and group-move tests, accessibility cancellation, telemetry assertions, and architecture docs for protocol v5. Size S, effort low, deps T4, parallel-ok false. Perf: 48 frontend tests and 160 expectations pass; no polling or per-frame steady-state work added.

## Milestone M3 — Proof and publication

- [x] `T6` Build, package, install, and validate repeated cold/warm entries in real VS Code. Size M, effort medium, deps T4/T5, parallel-ok false. Perf: 18 dense warm-entry captures plus 20 dense cold-entry captures sampled the critical split handoff; every recomposed surface contained the intro-free route and none contained the maximally zoomed logo or wordmark. A clean Extension Host reload was required after the in-place local install to discard preloaded HTML referencing obsolete asset hashes.
- [x] `T7` Update PR #2, re-run independent hostile review, inspect thread-aware GitHub feedback, and address every actionable finding. Size S, effort low, deps T6, parallel-ok false. Review verdict: ACCEPT at code HEAD `71ee904`; no P0-P3 findings and no review threads or actionable comments. The only failing remote check is the documented preexisting CI dependency-install issue also reproducible on `master`.

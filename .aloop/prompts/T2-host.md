# Task T2-host: independent host/webview race diagnosis

PERFORMANCE-FIRST DIRECTIVE (non-negotiable):
Every design and implementation decision optimizes runtime performance first.
- Choose the leanest viable approach: standard library before dependency, dependency
  only when it clearly beats hand-rolling on speed AND maintenance.
- Know your hot path: pick data structures and algorithms for the access pattern this
  code will actually have; state the expected complexity in a code comment only when
  a slower-looking choice is deliberate.
- No premature abstraction: layers, generics and indirection must pay for themselves.
- Measure when it matters: if the task touches a hot path, add or run a micro-benchmark
  or timing check and report the numbers in your result block.
- Budgets: fast startup, low allocation churn, minimal I/O round-trips, smallest viable
  bundle/binary. If you must trade performance for anything, say so explicitly in NOTES.

## Context

Lumen is a VS Code extension with a Svelte webview. Read `LUMEN_TRANSITION_MICROFRAME_BRIEF.md`, `extension/src/lumenEntry.ts`, `extension/src/lumenPanel.ts`, `frontend/src/App.svelte`, `frontend/src/app.css`, `frontend/src/entry/layoutCommit.ts`, and the related architectural plans. The working tree contains the current attempted fix. The observed regression is a microframe where the final split already exists while the right webview can still paint the fullscreen punch-in at maximum logo zoom.

## Requirements

1. Do not modify any file.
2. Use the authenticated Claude CLI (`claude -p`, frontend/UI specialist per the orchestration protocol) for an independent diagnosis; inspect its answer critically.
3. Explain the exact cross-process ordering failure and whether JavaScript `ResizeObserver` can ever make the visual transition atomic.
4. Evaluate a geometry-driven CSS latch: before the host move, install a dynamic media rule that does not match source geometry and, on the same style/layout pass as the final resize, hides `.lumen-intro` and starts `lumenUiZoomOut` on `.lumen-route-app`.
5. Identify edge cases: width increases, height-only changes, multi-group layouts, delayed callbacks, cleanup, reduced motion, and duplicate animation starts.
6. Recommend the smallest robust state-machine change and concrete tests.

## Done criteria

Return a concise diagnosis, recommended phase diagram, risks, and test matrix. No source edits and no Git writes.

End the final message with exactly:
RESULT: DONE | PARTIAL | BLOCKED
SUMMARY: <3–6 lines>
PERF: <performance implications>
NOTES: <caveats>

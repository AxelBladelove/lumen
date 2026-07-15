# Task T2-optical: independent optical timing review

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

Lumen is a VS Code extension with a premium loader transition. Read `LUMEN_TRANSITION_MICROFRAME_BRIEF.md`, `frontend/src/App.svelte`, `frontend/src/app.css`, and the architectural plans. Current timing: punch-in 180 ms, layout handoff requested at 60 ms, final UI zoom-out 160 ms. The invalid state is the final editor/UI split with the right column still showing the logo at scale 48–56.

## Requirements

1. Do not modify any file.
2. Use the authenticated Antigravity CLI with Gemini 3.5 Flash (`agy -p`, animation specialist per the orchestration protocol) for an independent motion/timing critique; inspect its answer critically.
3. Apply the project's stated visual intent, not generic animation advice: loader fullscreen, rapid full zoom into the logo field, immediate zoom-out into the final split.
4. Recommend a timing window for initiating the host move that preserves speed and removes a visible pause, assuming geometry-atomic CSS switches the rendered layer.
5. Review the scale/opacity/blur/chromatic/shake keyframes for whether the peak remains legible in the final column and which properties should remain unchanged.
6. Define frame-level acceptance criteria at 60 Hz and 120 Hz.

## Done criteria

Return a concise timing recommendation, optical continuity rationale, properties to preserve, and frame-level checks. No source edits and no Git writes.

End the final message with exactly:
RESULT: DONE | PARTIAL | BLOCKED
SUMMARY: <3–6 lines>
PERF: <performance implications>
NOTES: <caveats>

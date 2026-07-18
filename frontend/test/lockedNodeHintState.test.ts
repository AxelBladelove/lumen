import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import {
  expireLockedNodeHint,
  lockedNodeHintCopy,
  lockedNodeHintDurationMs,
  showLockedNodeHint
} from "../src/route-path-view/state/lockedNodeHintState";

const nodeOverlay = readFileSync(
  new URL("../src/route-path-view/components/NodeOverlay.svelte", import.meta.url),
  "utf8"
);

describe("locked node hint", () => {
  test("usa el copy sancionado y una región polite", () => {
    expect(lockedNodeHintCopy).toBe("Completa el paso anterior para desbloquearlo.");
    expect(nodeOverlay).toContain('role="status"');
    expect(nodeOverlay).toContain('aria-live="polite"');
    expect(nodeOverlay).toContain("lockedNodeHintCopy");
  });

  test("permanece 2.5 segundos y luego expira", () => {
    const hint = showLockedNodeHint("locked-3", 1_000);

    expect(lockedNodeHintDurationMs).toBe(2_500);
    expect(expireLockedNodeHint(hint, 3_499)).toBe(hint);
    expect(expireLockedNodeHint(hint, 3_500)).toBeNull();
  });

  test("una interacción repetida reinicia el ciclo de vida", () => {
    const first = showLockedNodeHint("locked-3", 1_000);
    const repeated = showLockedNodeHint("locked-3", 2_000);

    expect(repeated.expiresAt).toBe(4_500);
    expect(expireLockedNodeHint(repeated, first.expiresAt)).toBe(repeated);
  });
});

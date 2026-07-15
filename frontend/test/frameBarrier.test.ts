import { describe, expect, test } from "bun:test";
import { scheduleAfterPaintOpportunities } from "../src/entry/frameBarrier";
import { isRightGroupMoveConfirmed } from "../../extension/src/lumenPanelLayout";

function createFrameScheduler() {
  let nextHandle = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  return {
    request(callback: FrameRequestCallback) {
      const handle = nextHandle++;
      callbacks.set(handle, callback);
      return handle;
    },
    cancel(handle: number) {
      callbacks.delete(handle);
    },
    flush() {
      const pending = [...callbacks.entries()];
      callbacks.clear();
      for (const [, callback] of pending) callback(performance.now());
    },
    get pending() {
      return callbacks.size;
    }
  };
}

describe("entry frame barrier", () => {
  test("acks two complete paint opportunities on the third rAF callback", () => {
    const frames = createFrameScheduler();
    let ready = false;
    scheduleAfterPaintOpportunities({
      paintOpportunities: 2,
      requestFrame: frames.request,
      cancelFrame: frames.cancel,
      onReady: () => {
        ready = true;
      }
    });

    frames.flush();
    expect(ready).toBe(false);
    frames.flush();
    expect(ready).toBe(false);
    frames.flush();
    expect(ready).toBe(true);
    expect(frames.pending).toBe(0);
  });

  test("cancellation prevents a pending barrier from acknowledging", () => {
    const frames = createFrameScheduler();
    let ready = false;
    const cancel = scheduleAfterPaintOpportunities({
      paintOpportunities: 2,
      requestFrame: frames.request,
      cancelFrame: frames.cancel,
      onReady: () => {
        ready = true;
      }
    });

    frames.flush();
    cancel();
    frames.flush();
    frames.flush();
    expect(ready).toBe(false);
    expect(frames.pending).toBe(0);
  });

  test("starts a post-commit landing on the next renderer frame", () => {
    const frames = createFrameScheduler();
    let ready = false;
    scheduleAfterPaintOpportunities({
      paintOpportunities: 0,
      requestFrame: frames.request,
      cancelFrame: frames.cancel,
      onReady: () => {
        ready = true;
      }
    });

    expect(ready).toBe(false);
    frames.flush();
    expect(ready).toBe(true);
  });
});

describe("right-group move verification", () => {
  test("accepts an actual move to a higher view column", () => {
    expect(isRightGroupMoveConfirmed(1, 2, [1, 2])).toBe(true);
  });

  test("accepts a no-op only when Lumen was already at the right edge", () => {
    expect(isRightGroupMoveConfirmed(2, 2, [1, 2])).toBe(true);
    expect(isRightGroupMoveConfirmed(2, 2, [1, 2, 3])).toBe(false);
  });

  test("rejects a resolved no-op with no editor group on the left", () => {
    expect(isRightGroupMoveConfirmed(1, 1, [1])).toBe(false);
  });

  test("rejects movement to a lower view column", () => {
    expect(isRightGroupMoveConfirmed(2, 1, [1, 2])).toBe(false);
  });
});

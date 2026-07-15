import { describe, expect, test } from "bun:test";
import { hasLayoutCommitGeometryChanged } from "../src/entry/layoutCommit";

describe("layout commit geometry barrier", () => {
  test("does not commit for ResizeObserver's unchanged initial callback", () => {
    expect(
      hasLayoutCommitGeometryChanged(
        { width: 1920, height: 1080 },
        { width: 1920, height: 1080 }
      )
    ).toBe(false);
  });

  test("ignores sub-threshold compositor jitter", () => {
    expect(
      hasLayoutCommitGeometryChanged(
        { width: 1920, height: 1080 },
        { width: 1902, height: 1070 }
      )
    ).toBe(false);
  });

  test("commits on the panel-width change caused by the split", () => {
    expect(
      hasLayoutCommitGeometryChanged(
        { width: 1920, height: 1080 },
        { width: 634, height: 1080 }
      )
    ).toBe(true);
  });

  test("does not pretend that an equal-size group move changed geometry", () => {
    expect(
      hasLayoutCommitGeometryChanged(
        { width: 634, height: 1080 },
        { width: 634, height: 1080 }
      )
    ).toBe(false);
  });
});

import { describe, expect, test } from "bun:test";
import {
  createLayoutCommitMediaQuery,
  createLayoutCommitMediaRule,
  hasLayoutCommitGeometryChanged
} from "../src/entry/layoutCommit";

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

  test("arms every direction in which the viewport can cross the threshold", () => {
    expect(createLayoutCommitMediaQuery({ width: 1920, height: 1080 })).toBe(
      "(max-width: 1896px), (min-width: 1944px), (max-height: 1056px), (min-height: 1104px)"
    );
  });

  test("hides the intro and starts the landing animation in one media rule", () => {
    const rule = createLayoutCommitMediaRule({ width: 1920, height: 1080 }, 160);

    expect(rule).toContain("html.lumen-layout-commit-enabled .lumen-intro");
    expect(rule).toContain("display: none !important");
    expect(rule).toContain("html.lumen-layout-commit-enabled .lumen-route-app");
    expect(rule).toContain("animation: lumenUiZoomOut 160ms");
  });
});

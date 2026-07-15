import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const appCss = readFileSync(new URL("../src/app.css", import.meta.url), "utf8");
const appSvelte = readFileSync(new URL("../src/App.svelte", import.meta.url), "utf8");
const extensionEntry = readFileSync(
  new URL("../../extension/src/lumenEntry.ts", import.meta.url),
  "utf8"
);
const extensionPanel = readFileSync(
  new URL("../../extension/src/lumenPanel.ts", import.meta.url),
  "utf8"
);

function focusKeyframes() {
  const focusStart = appCss.indexOf("@keyframes lumenIntroMarkFocus");
  const focusEnd = appCss.indexOf("@keyframes lumenIntroHaloFocus", focusStart);
  return { focusStart, focusEnd, css: appCss.slice(focusStart, focusEnd) };
}

describe("intro transition visual contract", () => {
  test("keeps the Lumen mark visible at the terminal focus frame", () => {
    const { focusStart, focusEnd, css } = focusKeyframes();

    expect(focusStart).toBeGreaterThanOrEqual(0);
    expect(focusEnd).toBeGreaterThan(focusStart);
    expect(css).toMatch(/100%\s*\{\s*opacity:\s*1;/);
    expect(css).not.toMatch(/100%\s*\{\s*opacity:\s*0;/);
  });

  test("uses a fast full zoom with optical velocity effects", () => {
    const { css } = focusKeyframes();

    expect(appCss).toMatch(/--lumen-intro-focus-duration:\s*180ms/);
    expect(appCss).toMatch(
      /lumenIntroMarkFocus var\(--lumen-intro-focus-duration\) linear both/
    );
    expect(css).toMatch(/skewX\(-0\.7deg\)/);
    expect(appCss).toMatch(/transform-origin:\s*50% 30\.25%/);
    expect(css).toMatch(/8%[\s\S]*scale\(1\.018\)/);
    expect(css).toMatch(/56%[\s\S]*scale\(48\)/);
    expect(css).toMatch(/100%[\s\S]*scale\(56\)/);
    expect(appCss).toMatch(/@keyframes lumenIntroOpticalSmear[\s\S]*blur\(4\.8px\)/);
    expect(appCss).toMatch(/@keyframes lumenIntroChromaticRed[\s\S]*hue-rotate\(302deg\)/);
    expect(appCss).toMatch(/@keyframes lumenIntroChromaticCyan[\s\S]*hue-rotate\(128deg\)/);
    expect(appCss).toMatch(/@keyframes lumenIntroImpactShake[\s\S]*translate3d\(-3px, 1\.5px, 0\)/);
    expect(appSvelte).toMatch(/lumen-intro-chromatic-red/);
    expect(appSvelte).toMatch(/lumen-intro-chromatic-cyan/);
  });

  test("lands the final UI with the matching zoom-out after layout commit", () => {
    expect(appCss).toMatch(
      /\.lumen-ui-entering\s+\.lumen-route-app[\s\S]*lumenUiZoomOut 160ms/
    );
    expect(appCss).toMatch(
      /@keyframes lumenUiZoomOut[\s\S]*scale\(1\.11\)[\s\S]*scale\(1\)/
    );
    expect(appSvelte).toMatch(
      /classList\.add\("lumen-layout-committed"\);\s*beginUiZoomOut\(\);/
    );
  });

  test("prearms the commit and overlaps VS Code layout work with the punch-in", () => {
    expect(appSvelte).toMatch(/const introLayoutLeadMs = 120;/);
    expect(appSvelte).toMatch(
      /type LayoutCommitPhase = "idle" \| "armed" \| "enabled" \| "committed";/
    );
    expect(appSvelte).toMatch(
      /if \(runningInExtensionHost && !enableLayoutCommit\(\)\) return;/
    );
    expect(appSvelte).toMatch(
      /payload:\s*\{\s*delayMs:\s*introLayoutHandoffAtMs\s*\}/
    );
    expect(extensionPanel).toMatch(
      /this\.layoutHandoffTimer = setTimeout\(\(\) => \{[\s\S]*this\.layoutHandoffSignal\.resolve\(\);[\s\S]*\}, safeDelayMs\);/
    );
    expect(appSvelte).toMatch(/if \(layoutCommitPhase !== "enabled"\) return;/);

    const ready = extensionEntry.indexOf("await panel.waitForReady");
    const prearm = extensionEntry.indexOf("panel.requestLayoutCommit();", ready);
    const armed = extensionEntry.indexOf("await panel.waitForLayoutCommitArmed", prearm);
    const handoff = extensionEntry.indexOf("await panel.waitForLayoutHandoff", armed);
    const move = extensionEntry.indexOf("await panel.moveAsideAndLock", handoff);

    expect(ready).toBeGreaterThanOrEqual(0);
    expect(prearm).toBeGreaterThan(ready);
    expect(armed).toBeGreaterThan(prearm);
    expect(handoff).toBeGreaterThan(armed);
    expect(move).toBeGreaterThan(handoff);
  });

  test("reports the measured focus-to-commit interval for runtime proof", () => {
    expect(appSvelte).toMatch(
      /performance\.measure\(\s*"lumen:intro-focus-to-layout-commit"/
    );
    expect(appSvelte).toMatch(
      /schedule\("entry-transition-committed", 0\)/
    );
    expect(appSvelte).toMatch(
      /performance\.mark\("lumen:ui-zoom-out-start"\)/
    );
    expect(appSvelte).toMatch(
      /schedule\("entry-transition-settled", 0\)/
    );
    expect(appSvelte).toMatch(
      /if \(layoutCommitPhase === "committed"\) \{\s*postRevealedOnce\(\);\s*return;/
    );
  });

  test("removes the complete curtain atomically at layout commit", () => {
    expect(appCss).toMatch(
      /\.lumen-layout-committed\s+\.lumen-intro\s*\{\s*display:\s*none\s*!important;/
    );
  });
});

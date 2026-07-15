import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const appCss = readFileSync(new URL("../src/app.css", import.meta.url), "utf8");
const appSvelte = readFileSync(new URL("../src/App.svelte", import.meta.url), "utf8");
const indexHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const viteConfig = readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");
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
  test("keeps the static curtain alive through the Svelte punch-in handoff", () => {
    const staticIntro = indexHtml.indexOf('id="lumen-static-intro"');
    const appRoot = indexHtml.indexOf('<div id="app">');

    expect(staticIntro).toBeGreaterThanOrEqual(0);
    expect(appRoot).toBeGreaterThan(staticIntro);
    expect(indexHtml.slice(staticIntro, appRoot)).toContain("data-lumen-static-intro");
    expect(indexHtml).toMatch(/\.lumen-static-intro\s*\{[\s\S]*z-index:\s*200/);
    expect(indexHtml).not.toContain("lumenStaticMarkIn");
    const staticMarkCss = indexHtml.slice(
      indexHtml.indexOf(".lumen-static-mark {"),
      indexHtml.indexOf(".lumen-static-bar {")
    );
    expect(staticMarkCss).not.toContain("drop-shadow");
    expect(staticMarkCss).not.toContain("translateY");
    expect(staticMarkCss).toMatch(/position:\s*absolute/);
    expect(staticMarkCss).toMatch(/left:\s*calc\(50% - 116px\)/);
    expect(staticMarkCss).toMatch(/top:\s*calc\(50% - 88px\)/);
    expect(viteConfig).toMatch(/data:image\/svg\+xml;base64/);
    expect(viteConfig).toMatch(/data:image\/webp;base64/);
    expect(appSvelte).toMatch(/await tick\(\);[\s\S]*requestAnimationFrame[\s\S]*syncStaticIntroProgress\(introProgress\)/);
    expect(appSvelte).toMatch(
      /introCovering = true;[\s\S]*requestAnimationFrame\(removeStaticIntro\)/
    );
    expect(indexHtml).toContain("controlled: false");
    expect(appCss).toMatch(
      /\.lumen-intro-mark\s*\{[\s\S]*opacity:\s*1;[\s\S]*translate3d\(0, -12px, 0\) scale\(1\)/
    );
    expect(appCss).not.toContain("@keyframes lumenIntroMark {");
  });

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
      /@keyframes lumenUiZoomOut[\s\S]*scale\(1\.11\)[\s\S]*scale\(1\)/
    );
    expect(appSvelte).toMatch(
      /style\.textContent = createLayoutCommitMediaRule\([\s\S]*introUiZoomOutDurationMs/
    );
    expect(appSvelte).toMatch(
      /on:animationstart=\{handleUiZoomOutAnimationStart\}[\s\S]*on:animationend=\{handleUiZoomOutAnimationEnd\}/
    );
  });

  test("prearms the commit and overlaps VS Code layout work with the punch-in", () => {
    expect(appSvelte).toMatch(/const introLayoutHandoffAtMs = 60;/);
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
    const latchInstalled = appSvelte.indexOf("installLayoutCommitVisualLatch();");
    const phaseEnabled = appSvelte.indexOf('layoutCommitPhase = "enabled";', latchInstalled);
    expect(latchInstalled).toBeGreaterThanOrEqual(0);
    expect(phaseEnabled).toBeGreaterThan(latchInstalled);

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

  test("does not expose fullscreen until the curtain frontend is ready", () => {
    const prepare = extensionEntry.indexOf("await prepareLumenModeLayout");
    const createCurtain = extensionEntry.indexOf("panel.createFullScreen(rawHtml)", prepare);
    const ready = extensionEntry.indexOf("await panel.waitForReady", createCurtain);
    const closeLauncher = extensionEntry.indexOf("const sidebarClosing", ready);
    const awaitLayout = extensionEntry.indexOf("await Promise.all([sidebarClosing, zenActivating])", closeLauncher);

    expect(prepare).toBeGreaterThanOrEqual(0);
    expect(createCurtain).toBeGreaterThan(prepare);
    expect(ready).toBeGreaterThan(createCurtain);
    expect(closeLauncher).toBeGreaterThan(ready);
    expect(awaitLayout).toBeGreaterThan(closeLauncher);
    expect(appSvelte).toMatch(
      /requestAnimationFrame\(\(\) => \{[\s\S]*requestAnimationFrame\(\(\) => \{[\s\S]*type:\s*"frontend\.ready"/
    );
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
    expect(appSvelte).toMatch(
      /document\.head\.append\(style\);[\s\S]*classList\.add\("lumen-layout-commit-enabled"\)/
    );
  });
});

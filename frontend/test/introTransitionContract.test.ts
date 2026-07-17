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
const extensionHost = readFileSync(
  new URL("../../extension/src/lumenWebviewHost.ts", import.meta.url),
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

    expect(appCss).toMatch(/--lumen-intro-focus-duration:\s*120ms/);
    expect(appCss).toMatch(
      /lumenIntroMarkFocus var\(--lumen-intro-focus-duration\) linear both/
    );
    expect(css).toMatch(/46%[\s\S]*skewX\(-2\.8deg\)[\s\S]*scale\(30\)/);
    expect(appCss).toMatch(/transform-origin:\s*50% 30\.25%/);
    expect(css).toMatch(/10%[\s\S]*scale\(1\.018\)/);
    expect(css).toMatch(/58%[\s\S]*scale\(50\)/);
    expect(css).toMatch(/100%[\s\S]*scale\(56\)/);
    expect(appCss).toMatch(/@keyframes lumenIntroOpticalSmear[\s\S]*46%[\s\S]*blur\(1\.4px\)/);
    expect(appCss).toMatch(/\.lumen-intro-chromatic-red\s*\{[\s\S]*hue-rotate\(302deg\)/);
    expect(appCss).toMatch(/\.lumen-intro-chromatic-cyan\s*\{[\s\S]*hue-rotate\(128deg\)/);
    expect(appCss).toMatch(/@keyframes lumenIntroChromaticRed[\s\S]*45%[\s\S]*translate3d\(-1\.9px, 0\.4px, 0\)/);
    expect(appCss).toMatch(/@keyframes lumenIntroChromaticCyan[\s\S]*45%[\s\S]*translate3d\(2px, -0\.4px, 0\)/);
    expect(appCss).toMatch(/@keyframes lumenIntroImpactShake[\s\S]*47%[\s\S]*translate3d\(-3\.4px, 1\.6px, 0\)/);
    expect(appCss).toMatch(/@keyframes lumenIntroSpectralStreak[\s\S]*45%[\s\S]*opacity:\s*0\.5/);
    const redStart = appCss.indexOf("@keyframes lumenIntroChromaticRed");
    const cyanStart = appCss.indexOf("@keyframes lumenIntroChromaticCyan", redStart);
    const shakeStart = appCss.indexOf("@keyframes lumenIntroImpactShake", cyanStart);
    const atmosphereStart = appCss.indexOf("@keyframes lumenIntroAtmosphereFocus", shakeStart);
    const vignetteStart = appCss.indexOf("@keyframes lumenIntroVignetteFocus", atmosphereStart);
    expect(appCss.slice(redStart, cyanStart)).not.toContain("filter:");
    expect(appCss.slice(cyanStart, shakeStart)).not.toContain("filter:");
    expect(appCss.slice(atmosphereStart, vignetteStart)).not.toContain("filter:");
    expect(appSvelte).toMatch(/lumen-intro-chromatic-red/);
    expect(appSvelte).toMatch(/lumen-intro-chromatic-cyan/);
  });

  test("lands the final UI with the matching zoom-out after layout commit", () => {
    expect(appCss).toMatch(
      /@keyframes lumenUiZoomOut[\s\S]*scale\(1\.11\)[\s\S]*scale\(1\)/
    );
    expect(appCss).toMatch(
      /\.lumen-ui-handoff-frozen \.lumen-route-app\s*\{[\s\S]*opacity:\s*0\.86;[\s\S]*scale\(1\.11\)/
    );
    expect(appCss).toMatch(
      /\.lumen-ui-entering \.lumen-route-app\s*\{[\s\S]*animation:\s*lumenUiZoomOut 120ms/
    );
    expect(appSvelte).toMatch(
      /on:animationstart=\{handleUiZoomOutAnimationStart\}[\s\S]*on:animationend=\{handleUiZoomOutAnimationEnd\}[\s\S]*on:animationcancel=\{handleUiZoomOutAnimationCancel\}/
    );
  });

  test("prepaints a token-correlated safe frame before VS Code moves the panel", () => {
    expect(appSvelte).toMatch(/const introLayoutHandoffAtMs = 58;/);
    expect(appSvelte).toMatch(
      /type LayoutCommitPhase =[\s\S]*"armed"[\s\S]*"preparing"[\s\S]*"safe"[\s\S]*"committed"[\s\S]*"settled";/
    );
    expect(appSvelte).toMatch(
      /if \(runningInExtensionHost && !scheduleLayoutCommit\(\)\) return;/
    );
    expect(appSvelte).toMatch(
      /payload:\s*\{\s*delayMs:\s*introLayoutHandoffAtMs,\s*token:\s*layoutCommitToken!\s*\}/
    );
    expect(extensionPanel).toMatch(
      /if \(token !== this\.activeLayoutToken\) return;[\s\S]*this\.layoutHandoffSignal\.resolve\(\);/
    );
    expect(extensionHost).toMatch(
      /postLayoutHandoffPrepare\(token: string\)[\s\S]*lumen\.layoutHandoffPrepare[\s\S]*payload: \{ token \}/
    );

    const ready = extensionEntry.indexOf("await panel.waitForReady");
    const prearm = extensionEntry.indexOf("panel.requestLayoutCommit();", ready);
    const armed = extensionEntry.indexOf("await panel.waitForLayoutCommitArmed", prearm);
    const handoff = extensionEntry.indexOf("await panel.waitForLayoutHandoff", armed);
    const prepare = extensionEntry.indexOf("panel.requestLayoutHandoffPreparation()", handoff);
    const prepared = extensionEntry.indexOf("await panel.waitForLayoutHandoffPrepared", prepare);
    const move = extensionEntry.indexOf("await panel.moveAsideAndLock", prepared);
    const commit = extensionEntry.indexOf("panel.confirmLayoutCommitted()", move);

    expect(ready).toBeGreaterThanOrEqual(0);
    expect(prearm).toBeGreaterThan(ready);
    expect(armed).toBeGreaterThan(prearm);
    expect(handoff).toBeGreaterThan(armed);
    expect(prepare).toBeGreaterThan(handoff);
    expect(prepared).toBeGreaterThan(prepare);
    expect(move).toBeGreaterThan(prepared);
    expect(commit).toBeGreaterThan(move);
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
      /window\.dispatchEvent\(new Event\("lumen:entry-transition-settled"\)\);\s*postRevealedOnce\(\);/
    );
  });

  test("makes every compositor-safe surface intro-free before host movement", () => {
    expect(appSvelte).toMatch(
      /classList\.add\("lumen-ui-handoff-frozen"\);\s*removeStaticIntro\(\);\s*introVisible = false;[\s\S]*await tick\(\);/
    );
    expect(appSvelte).toMatch(
      /scheduleAfterPaintOpportunities\(\{\s*paintOpportunities: 2,[\s\S]*type: "frontend\.layoutHandoffPrepared"/
    );
    expect(appSvelte).toMatch(
      /scheduleAfterPaintOpportunities\(\{\s*paintOpportunities: 0,[\s\S]*beginCommittedLayout\(token\)/
    );
    expect(appSvelte).toMatch(
      /if \(!reduceMotion\) document\.documentElement\.classList\.add\("lumen-ui-entering"\);\s*document\.documentElement\.classList\.remove\("lumen-ui-handoff-frozen"\);/
    );
    expect(appSvelte).not.toContain("new ResizeObserver");
    expect(appSvelte).not.toContain("createLayoutCommitMediaRule");
    expect(extensionPanel).toMatch(
      /onFrontendLayoutHandoffPrepared: \(token\) => \{\s*if \(token !== this\.activeLayoutToken \|\| !this\.layoutPreparationRequested\) return;/
    );
    expect(extensionPanel).toMatch(
      /if \(!this\.activeLayoutToken \|\| !this\.layoutHandoffReached\) return false;/
    );
    expect(extensionPanel).toMatch(
      /if \(!this\.activeLayoutToken \|\| !this\.layoutPreparationCompleted\) return false;/
    );
    expect(appSvelte).toMatch(
      /type: "frontend\.revealed", payload: \{ token: layoutCommitToken \}/
    );
    expect(extensionPanel).toMatch(
      /onFrontendRevealed: \(token\) => \{\s*if \(token !== this\.activeLayoutToken \|\| !this\.layoutPreparationCompleted\) return;/
    );
    expect(extensionEntry).toMatch(
      /const layoutMoved = await panel\.moveAsideAndLock\(\);\s*if \(!layoutMoved\) \{\s*throw new Error/
    );
    expect(extensionPanel).toMatch(
      /await vscode\.commands\.executeCommand\("workbench\.action\.moveEditorToRightGroup"\);/
    );
    expect(extensionEntry).toMatch(
      /const revealed = await panel\.waitForRevealed\(frontendRevealTimeoutMs\);\s*if \(!revealed \|\| !panel\.canActivateLayoutTransition\(layoutTransitionToken\)\)/
    );
    expect(extensionEntry).not.toContain("panel.waitForLayoutLock()");
    expect(extensionPanel).toMatch(
      /void executeCommandSafely\("workbench\.action\.lockEditorGroup"\);/
    );
    expect(extensionPanel).toMatch(/this\.layoutHandoffPreparedSignal\.cancel\(\);/);
  });
});

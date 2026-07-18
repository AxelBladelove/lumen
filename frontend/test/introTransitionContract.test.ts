import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const appCss = readFileSync(new URL("../src/app.css", import.meta.url), "utf8");
const appSvelte = readFileSync(new URL("../src/App.svelte", import.meta.url), "utf8");
const indexHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const viteConfig = readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");
const packageJson = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8")
);
const webviewContent = readFileSync(
  new URL("../../extension/src/lumenWebviewContent.ts", import.meta.url),
  "utf8"
);
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

function eclipseCss() {
  const eclipseStart = appCss.indexOf("VARIANTE DE ENTRADA: ECLIPSE");
  const eclipseEnd = appCss.indexOf("FIN VARIANTE ECLIPSE", eclipseStart);
  return { eclipseStart, eclipseEnd, css: appCss.slice(eclipseStart, eclipseEnd) };
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
    expect(indexHtml).toMatch(/filter:\s*brightness\(var\(--lumen-static-brightness\)\)/);
    expect(indexHtml).toMatch(/opacity:\s*var\(--lumen-static-mark-opacity\)/);
    expect(appSvelte).toMatch(/const introProgressDurationMs = 650;/);
    expect(appSvelte).toMatch(/const introProgressCompletionHoldMs = 90;/);
    expect(appSvelte).toMatch(/const easedProgress = 1 - Math\.pow\(1 - progress, 3\);/);
    expect(appSvelte).toMatch(/progressFrame = requestAnimationFrame\(updateProgress\);/);
    expect(appSvelte).not.toContain("window.setInterval(updateProgress");
    expect(appSvelte).toContain("{Math.floor(introProgress)}%");
    expect(appSvelte).toMatch(/\(clamped - 88\) \/ 12/);
    expect(appSvelte).toContain('"--lumen-static-brightness"');
    expect(appSvelte).toContain('"--lumen-static-mark-opacity"');
    expect(appCss).toMatch(
      /\.lumen-intro:not\(\.intro-covering\) \.lumen-intro-mark\s*\{[\s\S]*--lumen-loading-mark-opacity/
    );
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
    // El lockup muere EN EL SITIO en el primer golpe (22% ≈ 26 ms): nunca se
    // le ve inflarse. El vuelo entero es luz (halo + bloom), no logo.
    expect(appCss).toMatch(/@keyframes lumenIntroOpticalSmear[\s\S]*0%,\s*8%\s*\{\s*opacity:\s*1;/);
    expect(appCss).toMatch(/@keyframes lumenIntroOpticalSmear[\s\S]*22%,\s*100%\s*\{\s*opacity:\s*0;/);
    expect(appCss).toMatch(/@keyframes lumenIntroHaloFocus[\s\S]*30%\s*\{\s*opacity:\s*1;/);
    expect(appCss).toMatch(/\.lumen-intro-chromatic-red\s*\{[\s\S]*hue-rotate\(302deg\)/);
    expect(appCss).toMatch(/\.lumen-intro-chromatic-cyan\s*\{[\s\S]*hue-rotate\(128deg\)/);
    expect(appCss).toMatch(/@keyframes lumenIntroChromaticRed[\s\S]*12%[\s\S]*translate3d\(-1\.6px, 0\.35px, 0\)/);
    expect(appCss).toMatch(/@keyframes lumenIntroChromaticRed[\s\S]*26%,\s*100%\s*\{\s*opacity:\s*0;/);
    expect(appCss).toMatch(/@keyframes lumenIntroChromaticCyan[\s\S]*12%[\s\S]*translate3d\(1\.7px, -0\.35px, 0\)/);
    expect(appCss).toMatch(/@keyframes lumenIntroChromaticCyan[\s\S]*26%,\s*100%\s*\{\s*opacity:\s*0;/);
    // El shake vive pegado al impacto: pico máximo al 28%, no en pleno vuelo.
    expect(appCss).toMatch(/@keyframes lumenIntroImpactShake[\s\S]*28%[\s\S]*translate3d\(-3\.4px, 1\.6px, 0\)/);
    // La escala del mark se mantiene quieta hasta la muerte del lockup (22%).
    expect(appCss).toMatch(/@keyframes lumenIntroMarkFocus[\s\S]*22%\s*\{\s*opacity:\s*1;\s*transform:\s*translate3d\(0, -10px, 0\) scale\(1\.018\)/);
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
      /@keyframes lumenUiZoomOut[\s\S]*scale\(1\.3\)[\s\S]*scale\(1\.045\)[\s\S]*scale\(1\)/
    );
    // El frame congelado del handoff y el 0% del zoom-out deben ser el MISMO
    // estado óptico: si divergen, el primer frame tras el movimiento salta.
    const frozenSurface = "transform: translateZ(0) scale(1.3);";
    // Brillo contenido (1.45, no 2.1): el pico es azul Lumen saturado, nunca
    // un flash cuasi-blanco.
    const frozenFilter = "filter: blur(18px) saturate(1.5) brightness(1.45);";
    const frozenBlock = appCss.slice(
      appCss.indexOf(".lumen-ui-handoff-frozen .lumen-route-app"),
      appCss.indexOf(".lumen-ui-entering .lumen-route-app")
    );
    const zoomOutKeyframes = appCss.slice(
      appCss.indexOf("@keyframes lumenUiZoomOut"),
      appCss.indexOf(".lumen-ui-handoff-frozen .lumen-route-app")
    );
    expect(frozenBlock).toContain("opacity: 1;");
    expect(frozenBlock).toContain(frozenSurface);
    expect(frozenBlock).toContain(frozenFilter);
    expect(zoomOutKeyframes).toContain(frozenSurface);
    expect(zoomOutKeyframes).toContain(frozenFilter);
    expect(zoomOutKeyframes).toMatch(/100%\s*\{[\s\S]*blur\(0\)[\s\S]*brightness\(1\)/);
    expect(appCss).toMatch(
      /\.lumen-ui-entering \.lumen-route-app\s*\{[\s\S]*animation:\s*lumenUiZoomOut 340ms/
    );
    expect(appSvelte).toMatch(
      /velocity:\s*\{[\s\S]*introUiZoomOutDurationMs:\s*340[\s\S]*iris:\s*\{[\s\S]*introUiZoomOutDurationMs:\s*360/
    );
    expect(appSvelte).toMatch(
      /on:animationstart=\{handleUiZoomOutAnimationStart\}[\s\S]*on:animationend=\{handleUiZoomOutAnimationEnd\}[\s\S]*on:animationcancel=\{handleUiZoomOutAnimationCancel\}/
    );
  });

  test("covers the handoff and workbench move under the entry light veil", () => {
    // El velo prolonga el glow del punch-in mientras la ruta congelada pasa por
    // fullscreen y el snap de geometría; sin él, ambos cortes son visibles.
    expect(appSvelte).toMatch(/<div class="lumen-entry-veil" aria-hidden="true"><\/div>/);
    expect(appCss).toMatch(
      /\.lumen-entry-veil\s*\{[\s\S]*position:\s*fixed;[\s\S]*opacity:\s*0;[\s\S]*visibility:\s*hidden;[\s\S]*pointer-events:\s*none;/
    );
    expect(appCss).toMatch(
      /\.lumen-ui-handoff-frozen \.lumen-entry-veil\s*\{\s*opacity:\s*1;\s*visibility:\s*visible;\s*\}/
    );
    // El bloom entra DURANTE el punch-in (combinador ~ sobre el hermano
    // posterior) y a plena opacidad antes del tramo cubierto: el logo en
    // pleno vuelo queda tapado por luz, no por un fundido propio.
    expect(appSvelte).toMatch(/\{\/if\}[\s\S]*<div class="lumen-entry-veil" aria-hidden="true"><\/div>/);
    expect(appCss).toMatch(
      /\.lumen-intro\.intro-covering ~ \.lumen-entry-veil\s*\{[\s\S]*animation:\s*lumenEntryVeilIn 120ms linear both;/
    );
    expect(appCss).toMatch(
      /@keyframes lumenEntryVeilIn[\s\S]*0%,\s*18%\s*\{\s*opacity:\s*0;[\s\S]*44%,\s*100%\s*\{\s*opacity:\s*1;/
    );
    expect(appCss).toMatch(/\.lumen-entry-veil\s*\{[\s\S]*z-index:\s*150;/);
    expect(appCss).toMatch(
      /\.lumen-ui-entering \.lumen-entry-veil\s*\{\s*animation:\s*lumenEntryVeilOut 260ms[\s\S]*both;/
    );
    expect(appCss).toMatch(
      /@keyframes lumenEntryVeilOut[\s\S]*100%\s*\{[\s\S]*opacity:\s*0;[\s\S]*visibility:\s*hidden;/
    );
    // Accesibilidad: sin movimiento no hay velo ni filtros.
    expect(appCss).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*filter:\s*none;[\s\S]*\.lumen-entry-veil\s*\{\s*display:\s*none;\s*\}/
    );
  });

  test("keeps the iris variant scoped and continuous across the frozen handoff", () => {
    expect(appCss).toMatch(
      /VARIANTE DE ENTRADA: IRIS[\s\S]*html\[data-lumen-entry-style="iris"\] \.lumen-intro\.intro-covering\s*\{[\s\S]*animation:\s*none;[\s\S]*html\[data-lumen-entry-style="iris"\] \.lumen-intro\.intro-covering \.lumen-intro-primary\s*\{\s*animation:\s*none;\s*\}[\s\S]*html\[data-lumen-entry-style="iris"\] \.lumen-intro\.intro-covering ~ \.lumen-entry-veil::before\s*\{\s*animation:\s*lumenIrisBloom 140ms linear both;/
    );
    expect(appCss).toMatch(
      /html\[data-lumen-entry-style="iris"].lumen-ui-handoff-frozen \.lumen-route-app\s*\{\s*opacity:\s*1;\s*transform:\s*translateZ\(0\) scale\(1\.24\);[\s\S]*filter:\s*blur\(16px\) saturate\(1\.45\) brightness\(1\.4\);[\s\S]*html\[data-lumen-entry-style="iris"].lumen-ui-handoff-frozen \.lumen-entry-veil\s*\{\s*opacity:\s*1;\s*visibility:\s*visible;\s*\}[\s\S]*html\[data-lumen-entry-style="iris"].lumen-ui-handoff-frozen \.lumen-entry-veil::before\s*\{\s*opacity:\s*1;\s*transform:\s*translate3d\(-50%, -50%, 0\) scale\(0\.9\);\s*\}[\s\S]*html\[data-lumen-entry-style="iris"].lumen-ui-handoff-frozen \.lumen-entry-veil::after\s*\{\s*opacity:\s*0\.5;\s*transform:\s*translate3d\(-50%, -50%, 0\) scale\(0\.94\);\s*\}[\s\S]*@keyframes lumenIrisSettle\s*\{\s*0%\s*\{\s*opacity:\s*1;\s*transform:\s*translateZ\(0\) scale\(1\.24\);\s*filter:\s*blur\(16px\) saturate\(1\.45\) brightness\(1\.4\);[\s\S]*@keyframes lumenIrisRetract\s*\{\s*0%\s*\{\s*opacity:\s*1;\s*transform:\s*translate3d\(-50%, -50%, 0\) scale\(0\.9\);[\s\S]*@keyframes lumenIrisRimRetract\s*\{\s*0%\s*\{\s*opacity:\s*0\.5;\s*transform:\s*translate3d\(-50%, -50%, 0\) scale\(0\.94\);[\s\S]*@keyframes lumenIrisAmbientOut\s*\{\s*0%\s*\{\s*opacity:\s*1;\s*visibility:\s*visible;/
    );
    expect(appSvelte).toMatch(
      /function handleUiZoomOutAnimationStart[\s\S]*event\.animationName !== "lumenUiZoomOut"[\s\S]*event\.animationName !== "lumenIrisSettle"[\s\S]*function handleUiZoomOutAnimationEnd[\s\S]*event\.animationName !== "lumenUiZoomOut"[\s\S]*event\.animationName !== "lumenIrisSettle"[\s\S]*function handleUiZoomOutAnimationCancel[\s\S]*event\.animationName !== "lumenUiZoomOut"[\s\S]*event\.animationName !== "lumenIrisSettle"[\s\S]*function handleIntroMarkAnimationEnd[\s\S]*event\.animationName !== "lumenIntroMarkFocus"[\s\S]*event\.animationName !== "lumenIrisMarkCollapse"/
    );
  });

  test("keeps eclipse dark, scoped and continuous across the frozen handoff", () => {
    const { eclipseStart, eclipseEnd, css } = eclipseCss();

    expect(eclipseStart).toBeGreaterThanOrEqual(0);
    expect(eclipseEnd).toBeGreaterThan(eclipseStart);

    // Las clases de estado viven en <html>: no puede existir un combinador de
    // descendiente entre el atributo de variante y lumen-ui-*.
    expect(css).toMatch(
      /html\[data-lumen-entry-style="eclipse"\]\.lumen-ui-handoff-frozen \.lumen-route-app\s*\{/
    );
    expect(css).toMatch(
      /html\[data-lumen-entry-style="eclipse"\]\.lumen-ui-entering \.lumen-route-app\s*\{/
    );
    expect(css).not.toMatch(
      /html\[data-lumen-entry-style="eclipse"\]\s+\.lumen-ui-(?:handoff-frozen|entering)/
    );

    // Frozen y el 0% del aterrizaje comparten literalmente el mismo estado
    // óptico, número a número, para que el primer frame post-move no salte.
    const frozenBlock = css.slice(
      css.indexOf('html[data-lumen-entry-style="eclipse"].lumen-ui-handoff-frozen .lumen-route-app'),
      css.indexOf('html[data-lumen-entry-style="eclipse"].lumen-ui-handoff-frozen .lumen-entry-veil')
    );
    const riseStart = css.indexOf("@keyframes lumenEclipseRise");
    const riseZeroBlock = css.slice(riseStart, css.indexOf("45%", riseStart));
    const matchingFrozenDeclarations = [
      "opacity: 0.78;",
      "transform: translateZ(0) scale(0.985);",
      "filter: blur(3.5px) brightness(0.9);"
    ];
    for (const declaration of matchingFrozenDeclarations) {
      expect(frozenBlock).toContain(declaration);
      expect(riseZeroBlock).toContain(declaration);
    }

    const veilStart = css.indexOf('html[data-lumen-entry-style="eclipse"] .lumen-entry-veil {');
    const veilEnd = css.indexOf(
      'html[data-lumen-entry-style="eclipse"] .lumen-entry-veil::before',
      veilStart
    );
    const veilBlock = css.slice(veilStart, veilEnd);
    expect(veilBlock).toMatch(/background:\s*#010508;/);
    expect(veilBlock).not.toMatch(/gradient\(/);
    expect(css).toMatch(
      /html\[data-lumen-entry-style="eclipse"\] \.lumen-entry-veil::before,[\s\S]*content:\s*none;[\s\S]*animation:\s*none;[\s\S]*opacity:\s*0;/
    );
    expect(css.replaceAll("#010508", "")).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(css).not.toMatch(/\b(?:rgb|rgba|hsl|hsla|color-mix)\(/i);

    // Regex negativo simple: dentro de la sección eclipse no se admite ningún
    // brightness numéricamente mayor que 1.
    expect(css).not.toMatch(
      /brightness\(\s*(?:1\.\d*[1-9]\d*|(?:[2-9]\d*|1\d+)(?:\.\d+)?)\s*\)/
    );

    // El negro se disuelve durante todo el aterrizaje. Si vuelve a apagarse
    // en un keyframe intermedio, el fade y el settle se perciben como dos
    // transiciones separadas.
    expect(css).toMatch(
      /\.lumen-ui-entering \.lumen-entry-veil\s*\{\s*animation:\s*lumenEclipseVeilOut 520ms cubic-bezier\(0\.45, 0, 0\.55, 1\) both;/
    );
    const veilOutStart = css.indexOf("@keyframes lumenEclipseVeilOut");
    const veilOutBlock = css.slice(veilOutStart, css.indexOf("@media", veilOutStart));
    expect(veilOutBlock).toMatch(/0%\s*\{\s*opacity:\s*1;\s*visibility:\s*visible;/);
    expect(veilOutBlock).toMatch(/100%\s*\{\s*opacity:\s*0;\s*visibility:\s*hidden;/);
    expect(veilOutBlock).not.toMatch(/(?:[1-9]|[1-9]\d)%\s*\{[^}]*opacity:\s*0;/);

    const requiredCascadeOverrides = [
      '.lumen-intro.intro-covering {',
      '.lumen-intro.intro-covering .lumen-intro-mark {',
      '.lumen-intro.intro-covering .lumen-intro-mark::before {',
      '.lumen-intro.intro-covering .lumen-intro-mark::after,',
      '.lumen-intro.intro-covering .lumen-intro-primary {',
      '.lumen-intro.intro-covering .lumen-intro-chromatic-red,',
      '.lumen-intro.intro-covering .lumen-intro-chromatic-cyan {',
      '.lumen-intro.intro-covering::before {',
      '.lumen-intro.intro-covering::after {',
      '.lumen-intro.intro-covering .lumen-intro-bar,',
      '.lumen-intro.intro-covering .lumen-intro-percent {',
      '.lumen-intro.intro-covering ~ .lumen-entry-veil {',
      '.lumen-ui-handoff-frozen .lumen-route-app {',
      '.lumen-ui-handoff-frozen .lumen-entry-veil {',
      '.lumen-ui-entering .lumen-route-app {',
      '.lumen-ui-entering .lumen-entry-veil {'
    ];
    for (const selector of requiredCascadeOverrides) {
      expect(css).toContain(selector);
    }
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*html\[data-lumen-entry-style="eclipse"\] \.lumen-intro\.intro-covering ~ \.lumen-entry-veil\s*\{\s*animation:\s*none;\s*\}/
    );
    expect(css).toMatch(
      /html\[data-lumen-entry-style="eclipse"\]\.lumen-ui-handoff-frozen \.lumen-route-app,[\s\S]*html\[data-lumen-entry-style="eclipse"\]\.lumen-ui-entering \.lumen-route-app\s*\{[\s\S]*animation:\s*none;[\s\S]*transform:\s*none;[\s\S]*filter:\s*none;/
    );

    expect(appSvelte).toMatch(
      /eclipse:\s*\{\s*introFocusDurationMs:\s*160,\s*introLayoutHandoffAtMs:\s*120,\s*introUiZoomOutDurationMs:\s*520\s*\}/
    );
    expect(appSvelte).toMatch(
      /requestedEntryStyle === "iris" \|\| requestedEntryStyle === "eclipse"/
    );

    for (const handlerName of [
      "handleUiZoomOutAnimationStart",
      "handleUiZoomOutAnimationEnd",
      "handleUiZoomOutAnimationCancel"
    ]) {
      const handlerStart = appSvelte.indexOf(`function ${handlerName}`);
      const handlerEnd = appSvelte.indexOf("\n  function ", handlerStart + 1);
      expect(appSvelte.slice(handlerStart, handlerEnd)).toContain('"lumenEclipseRise"');
    }
    const markHandlerStart = appSvelte.indexOf("function handleIntroMarkAnimationEnd");
    const markHandlerEnd = appSvelte.indexOf("\n  function ", markHandlerStart + 1);
    expect(appSvelte.slice(markHandlerStart, markHandlerEnd)).toContain('"lumenEclipseMarkOut"');
  });

  test("uses eclipse as the configured and webview fallback default", () => {
    const entryStyle = packageJson.contributes.configuration.properties["lumen.entryStyle"];

    expect(entryStyle.enum).toContain("eclipse");
    expect(entryStyle.default).toBe("eclipse");
    expect(entryStyle.markdownDescription).toContain("`eclipse` (predeterminado)");
    expect(webviewContent).toMatch(/get<string>\("entryStyle", "eclipse"\)/);
    expect(webviewContent).toMatch(/\? style : "eclipse"/);
  });

  test("prepaints a token-correlated safe frame before VS Code moves the panel", () => {
    expect(appSvelte).toMatch(
      /velocity:\s*\{[\s\S]*introLayoutHandoffAtMs:\s*58[\s\S]*iris:\s*\{[\s\S]*introLayoutHandoffAtMs:\s*126/
    );
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

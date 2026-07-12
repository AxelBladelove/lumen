<script lang="ts">
  import { onDestroy } from "svelte";
  import RoutePathView from "./route-path-view/RoutePathView.svelte";
  import { lumenBrand, ensureLumenFavicon } from "./brand/lumenBrand";
  import {
    buildRouteModuleFromEngine,
    cloneRouteModule,
    createInitialRouteModule,
    engineRouteModuleDataSource,
    routeModuleDataSource
  } from "./route-path-view/data/routeModuleSource";
  import type { RoutePathNode } from "./route-path-view/types/routePath";
  import { lumenWebviewProtocolVersion } from "./webview/messages";
  import { createVscodeBridge } from "./webview/vscodeBridge";

  const bridge = createVscodeBridge();
  const runningInExtensionHost = bridge.isConnected;
  const holdIntroForVisualTest =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).has("lumenPerfHoldIntro");
  // La cortina estatica de index.html corre desde el primer frame del webview;
  // al montar, la app retoma su porcentaje para que el contador sea continuo.
  const staticIntroProgress = readStaticIntroProgress();
  let routeModule = createInitialRouteModule();
  // Fuente efectiva del modulo actual: arranca en el mock y pasa a
  // `engine:<routeId>/<moduleId>` en cuanto llega `route.module.data`.
  let currentDataSource = routeModuleDataSource;
  // Estado autoritativo empujado por el Extension Host durante `exercise.activate`.
  // La UI solo lo refleja: nunca activa localmente ni inflige transiciones.
  let busyExerciseId: string | null = null;
  let activationError: string | null = null;
  // El intro arranca visible siempre: en el host el panel solo existe durante
  // la entrada a Lumen Mode, y fuera del host es la unica pantalla de carga.
  let introVisible = true;
  let introExiting = false;
  let introAssetsReady = false;
  let introProgressVisible = staticIntroProgress > 0;
  let introProgress = staticIntroProgress;
  let introCycle = 0;
  let revealedPosted = false;
  let routeVisualReady = false;
  let stopIntroGate = () => {};
  let stopIntroProgress = () => {};
  const introProgressDurationMs = 400;
  const introStableFrameDelayMs = 120;
  const introStableFrameBudgetMs = 26;

  // Handshake de layout: dentro del Extension Host el fade final espera a que la
  // extension confirme que el split ya esta colocado (mensaje `lumen.reveal`).
  // Asi la UI se descubre ya en editor-izquierda + Lumen-derecha, sin un frame
  // intermedio del modulo a pantalla completa. Fuera del host (Modo Libre /
  // navegador) no hay layout que colocar y se revela directo.
  let layoutPlaced = false;
  let layoutPlacedResolvers: Array<() => void> = [];
  const layoutPlacedFallbackMs = 1600;

  performance.mark("lumen:app-mounted");
  window.setTimeout(() => ensureLumenFavicon(), 80);

  const stopListening = bridge.onMessage((message) => {
    if (message.type === "route.module.snapshot") {
      routeModule = cloneRouteModule(message.payload.module);
    }

    if (message.type === "route.module.data") {
      routeModule = buildRouteModuleFromEngine(message.payload);
      currentDataSource = engineRouteModuleDataSource(
        message.payload.routeId,
        message.payload.moduleId
      );
    }

    // Los completados llegan implícitos en el siguiente `route.module.data`:
    // el snapshot mueve `activeExerciseId` y `RoutePathView` anima el delta. El
    // mensaje explícito se ignora para no duplicar avances.

    if (message.type === "route.activation.state") {
      busyExerciseId = message.payload.busy?.exerciseId ?? null;
      activationError = message.payload.error?.message ?? null;
    }

    if (message.type === "lumen.entry.transition" && message.payload.phase === "entering") {
      // Idempotente: si el intro del boot inicial sigue corriendo no se
      // reinicia (perderia el porcentaje heredado de la cortina estatica).
      // Solo re-entra cuando el intro ya se descarto (reveal de una sesion
      // previa) o esta saliendo.
      if (!introVisible || introExiting) restartIntroCycle();
    }

    if (message.type === "lumen.entry.transition" && message.payload.phase === "active") {
      dismissIntroNow();
    }

    // El layout final ya esta colocado detras de la cortina: se libera el fade.
    if (message.type === "lumen.reveal") {
      resolveLayoutPlaced();
    }
  });

  bridge.post({
    type: "frontend.ready",
    payload: {
      protocolVersion: lumenWebviewProtocolVersion,
      view: "route-path-view",
      routeId: "route-c",
      moduleId: routeModule.path.id,
      dataSource: currentDataSource
    }
  });

  const stopPerfReporting = setupPerfReporting();
  const stopIntroAssets = setupIntroAssets();
  stopIntroGate = setupIntroGate();
  stopIntroProgress = setupIntroProgress();

  // Escape dentro de la webview: la UI pide la salida de Lumen Mode por
  // protocolo. No depende del reenvio de keybindings de VS Code y sigue la
  // regla de exit-lumen-mode.md: lo temporal se cierra primero (aqui todavia
  // no hay UI temporal, asi que siempre se pide salir).
  function handleEscapeKey(event: KeyboardEvent) {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    bridge.post({ type: "lumen.exit.requested", payload: {} });
  }
  window.addEventListener("keydown", handleEscapeKey);

  onDestroy(() => {
    stopListening();
    stopPerfReporting();
    stopIntroAssets();
    stopIntroGate();
    stopIntroProgress();
    window.removeEventListener("keydown", handleEscapeKey);
  });

  function handleNodeSelected(node: RoutePathNode) {
    bridge.post({
      type: "route.node.selected",
      payload: {
        nodeId: node.id,
        status: node.status,
        nodeType: node.type
      }
    });
  }

  function handleContinueRequest(payload: { fromNodeId?: string; nextNodeId?: string }) {
    bridge.post({
      type: "route.continue.requested",
      payload
    });
  }

  function restartIntroCycle() {
    if (holdIntroForVisualTest) return;

    stopIntroGate();
    stopIntroProgress();
    document.documentElement.classList.remove("lumen-ui-revealing");

    introCycle += 1;
    introVisible = true;
    introExiting = false;
    introProgressVisible = false;
    introProgress = 0;
    revealedPosted = false;
    // Nueva entrada: el layout se vuelve a colocar, asi que el fade debe volver
    // a esperar la confirmacion de la extension.
    layoutPlaced = false;
    layoutPlacedResolvers = [];

    stopIntroGate = setupIntroGate();
    stopIntroProgress = setupIntroProgress();
  }

  function dismissIntroNow() {
    resolveLayoutPlaced();
    stopIntroGate();
    stopIntroProgress();
    document.documentElement.classList.remove("lumen-ui-revealing");
    introVisible = false;
    introExiting = false;
    introProgressVisible = false;
    introProgress = 100;
    postRevealedOnce();
  }

  function readStaticIntroProgress() {
    if (typeof window === "undefined") return 0;
    const progress = Number((window as any).__LUMEN_STATIC_INTRO__?.progress ?? 0);
    if (!Number.isFinite(progress)) return 0;
    return Math.min(92, Math.max(0, progress));
  }

  // El Extension Host espera esta señal para pasar del layout de carga (panel
  // a pantalla completa detras de la cortina) al layout final (split derecho).
  // Se emite cuando el intro termino de ocultarse: en ese punto la ruta ya
  // rindio (webgl incluido) y no quedan modulos cargando que una mutacion de
  // layout pueda interrumpir.
  function postRevealedOnce() {
    if (revealedPosted) return;
    revealedPosted = true;
    bridge.post({ type: "frontend.revealed", payload: {} });
  }

  function resolveLayoutPlaced() {
    if (layoutPlaced) return;
    layoutPlaced = true;
    const resolvers = layoutPlacedResolvers;
    layoutPlacedResolvers = [];
    resolvers.forEach((resolve) => resolve());
  }

  // Se resuelve cuando la extension confirma el layout (`lumen.reveal`) o, como
  // red de seguridad, tras un fallback para no colgar el revelado si la señal
  // nunca llega (host lento, build vieja de la extension, etc.).
  function waitForLayoutPlaced() {
    return new Promise<void>((resolve) => {
      if (layoutPlaced) {
        resolve();
        return;
      }
      layoutPlacedResolvers.push(resolve);
      window.setTimeout(resolve, layoutPlacedFallbackMs);
    });
  }

  function setupPerfReporting() {
    const timers: number[] = [];
    const scheduledLabels = new Set<string>();
    const disposers: Array<() => void> = [];
    const schedule = (label: string, delay = 0) => {
      if (scheduledLabels.has(label)) return;
      scheduledLabels.add(label);
      const timer = window.setTimeout(() => {
        void postPerfReport(label);
      }, delay);
      timers.push(timer);
    };

    const handleLoad = () => schedule("window-load", 0);
    const handleWebglFirstRender = () => {
      markRouteReadyWhenStable();
      schedule("webgl-first-render", 0);
      schedule("webgl-frame-sample", 80);
      schedule("late-frame-sample", 2600);
    };
    const handleInteractionFocus = () => {
      schedule("focused-frame-sample", 80);
    };
    const handleRouteAdvance = () => {
      schedule("route-advance-response", 0);
      schedule("route-advance-frame-sample", 120);
    };

    if (document.readyState === "complete") {
      schedule("window-load", 0);
    } else {
      window.addEventListener("load", handleLoad, { once: true });
      disposers.push(() => window.removeEventListener("load", handleLoad));
    }

    window.addEventListener("lumen:webgl-first-rendered", handleWebglFirstRender);
    disposers.push(() => window.removeEventListener("lumen:webgl-first-rendered", handleWebglFirstRender));
    window.addEventListener("pointerdown", handleInteractionFocus);
    window.addEventListener("focusin", handleInteractionFocus);
    window.addEventListener("lumen:route-advance-started", handleRouteAdvance);
    disposers.push(() => {
      window.removeEventListener("pointerdown", handleInteractionFocus);
      window.removeEventListener("focusin", handleInteractionFocus);
      window.removeEventListener("lumen:route-advance-started", handleRouteAdvance);
    });
    schedule("post-mount", 0);
    schedule("steady-frame-sample", 1200);
    schedule("late-frame-sample", 4200);

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      disposers.forEach((dispose) => dispose());
    };
  }

  async function postPerfReport(label: string) {
    const frameStats = label.endsWith("frame-sample") ? await sampleFrames() : undefined;
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const marks = Object.fromEntries(
      performance.getEntriesByType("mark").map((entry) => [entry.name, Math.round(entry.startTime * 10) / 10])
    );
    const measures = Object.fromEntries(
      performance.getEntriesByType("measure").map((entry) => [entry.name, Math.round(entry.duration * 10) / 10])
    );

    bridge.post({
      type: "perf.report",
      payload: {
        label,
        navigation: {
          domContentLoadedMs: navigation
            ? Math.round((navigation.domContentLoadedEventEnd - navigation.startTime) * 10) / 10
            : null,
          loadMs: navigation ? Math.round((navigation.loadEventEnd - navigation.startTime) * 10) / 10 : null
        },
        marks,
        measures,
        frameStats,
        webglStats: (window as any).__LUMEN_WEBGL_STATS__ ?? null,
        routePresent: Boolean(document.querySelector(".route-stage")),
        canvasPresent: Boolean(document.querySelector("canvas")),
        nodeCount: document.querySelectorAll(".route-node").length,
        visibilityState: document.visibilityState,
        hasFocus: document.hasFocus()
      }
    });
  }

  function sampleFrames() {
    return new Promise<{
      frames: number;
      avgFrameMs: number | null;
      p95FrameMs: number | null;
      maxFrameMs: number | null;
      overBudgetFrames: number;
    }>((resolve) => {
      const intervals: number[] = [];
      let started = 0;
      let last = 0;

      function frame(now: number) {
        if (!started) {
          started = now;
          last = now;
          requestAnimationFrame(frame);
          return;
        }

        intervals.push(now - last);
        last = now;
        if (now - started >= 1800) {
          const sorted = intervals.slice().sort((a, b) => a - b);
          const sum = intervals.reduce((total, value) => total + value, 0);
          resolve({
            frames: intervals.length,
            avgFrameMs: roundFrameValue(intervals.length ? sum / intervals.length : null),
            p95FrameMs: roundFrameValue(sorted.length ? sorted[Math.floor(sorted.length * 0.95)] : null),
            maxFrameMs: roundFrameValue(sorted.length ? sorted[sorted.length - 1] : null),
            overBudgetFrames: intervals.filter((value) => value > 20).length
          });
          return;
        }

        requestAnimationFrame(frame);
      }

      requestAnimationFrame(frame);
    });
  }

  function roundFrameValue(value: number | null) {
    return typeof value === "number" ? Math.round(value * 10) / 10 : null;
  }

  function markRouteReadyWhenStable() {
    const deadline = performance.now() + 6000;

    function ready() {
      const hero = document.querySelector<HTMLImageElement>(".hero-sticker-shell img");
      return Boolean(
        document.querySelector(".route-stage") &&
          document.querySelector("canvas") &&
          document.querySelectorAll(".route-node").length > 0 &&
          hero?.complete &&
          hero.naturalWidth > 0 &&
          (window as any).__LUMEN_WEBGL_STATS__?.renderCount > 0
      );
    }

    function markStable() {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          routeVisualReady = true;
          if (performance.getEntriesByName("lumen:route-visual-complete").length) return;
          performance.mark("lumen:route-visual-complete");
          performance.mark("lumen:route-interactive");
          window.dispatchEvent(new Event("lumen:route-visual-complete"));
          try {
            performance.measure("lumen:route-render-to-visual-complete", "lumen:route-mounted", "lumen:route-visual-complete");
            performance.measure("lumen:route-render-to-interactive", "lumen:route-mounted", "lumen:route-interactive");
          } catch {
            // Route marks are best-effort for harness and webview environments.
          }
        });
      });
    }

    function tick() {
      if (ready() || performance.now() > deadline) {
        markStable();
        return;
      }
      requestAnimationFrame(tick);
    }

    tick();
  }

  function setupIntroAssets() {
    let cancelled = false;
    const reveal = () => {
      if (cancelled || introAssetsReady) return;
      introAssetsReady = true;
      window.dispatchEvent(new Event("lumen:intro-assets-ready"));
    };
    const fallbackTimer = window.setTimeout(reveal, 360);

    Promise.all([waitForImage(lumenBrand.logoUrl), waitForImage(lumenBrand.wordmarkUrl)])
      .then(reveal)
      .catch(reveal)
      .finally(() => window.clearTimeout(fallbackTimer));

    return () => {
      cancelled = true;
      window.clearTimeout(fallbackTimer);
    };
  }

  function waitForImage(src: string) {
    return new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        if (typeof img.decode === "function") {
          img.decode().then(resolve).catch(resolve);
        } else {
          resolve();
        }
      };
      img.onerror = () => reject(new Error(`Unable to load intro asset: ${src}`));
      img.decoding = "sync";
      img.fetchPriority = "high";
      img.src = src;
    });
  }

  function setupIntroGate() {
    if (!introVisible) return () => {};

    const timers: number[] = [];
    let readyToReveal = routeVisualReady;
    let progressComplete = false;
    let completed = false;
    let cancelled = false;

    const beginReveal = () => {
      if (cancelled) return;
      const exitTimer = window.setTimeout(() => {
        performance.mark("lumen:intro-exit-start");
        document.documentElement.classList.add("lumen-ui-revealing");
        introExiting = true;
        const hiddenTimer = window.setTimeout(() => {
          introVisible = false;
          performance.mark("lumen:intro-hidden");
          document.documentElement.classList.remove("lumen-ui-revealing");
          postRevealedOnce();
        }, 860);
        timers.push(hiddenTimer);
      }, 120);
      timers.push(exitTimer);
    };

    const finishIntro = () => {
      if (completed) return;
      completed = true;
      performance.mark("lumen:intro-loading-complete");
      // La carga termino con la cortina todavia a pantalla completa. Dentro del
      // host se avisa a la extension para que coloque el split ANTES de revelar
      // (el fade aterriza entonces en la vista dividida, no en un frame del
      // modulo fullscreen). Fuera del host no hay layout que colocar: directo.
      if (!runningInExtensionHost) {
        beginReveal();
        return;
      }
      bridge.post({ type: "frontend.loadingComplete", payload: {} });
      waitForLayoutPlaced().then(beginReveal);
    };

    const markReadyToReveal = () => {
      if (holdIntroForVisualTest) return;
      readyToReveal = true;
      if (progressComplete) finishIntro();
    };
    const markProgressComplete = () => {
      progressComplete = true;
      if (readyToReveal) finishIntro();
    };

    window.addEventListener("lumen:route-visual-complete", markReadyToReveal, { once: true });
    window.addEventListener("lumen:intro-progress-complete", markProgressComplete, { once: true });
    const fallbackTimer = window.setTimeout(markReadyToReveal, 5200);
    timers.push(fallbackTimer);

    return () => {
      cancelled = true;
      window.removeEventListener("lumen:route-visual-complete", markReadyToReveal);
      window.removeEventListener("lumen:intro-progress-complete", markProgressComplete);
      document.documentElement.classList.remove("lumen-ui-revealing");
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }

  // This is a deliberate visual warmup, not a literal readiness meter. It only
  // starts once the intro can run to completion without waiting on app work.
  function setupIntroProgress() {
    if (!introVisible) return () => {};

    let settleFrame = 0;
    let progressTimer = 0;
    let progressInterval = 0;
    let assetsReady = introAssetsReady;
    let uiReady = routeVisualReady;
    let started = false;
    let completed = false;
    let progressStartedAt = 0;

    function completeProgress() {
      if (completed) return;
      completed = true;
      introProgress = 100;
      window.clearInterval(progressInterval);
      window.clearTimeout(progressTimer);
      window.dispatchEvent(new Event("lumen:intro-progress-complete"));
    }

    let progressBase = 0;

    function updateProgress() {
      if (completed) return;
      const progress = Math.min(1, (performance.now() - progressStartedAt) / introProgressDurationMs);
      introProgress = progress >= 1 ? 100 : Math.floor(progressBase + (100 - progressBase) * progress);
      if (progress >= 1) completeProgress();
    }

    function beginProgress() {
      // Continua desde el porcentaje actual (heredado de la cortina estatica)
      // en vez de reiniciar a 0: el contador es uno solo de punta a punta.
      progressBase = Math.min(96, Math.max(0, introProgress));
      introProgressVisible = true;
      progressStartedAt = performance.now();
      progressInterval = window.setInterval(updateProgress, 8);
      progressTimer = window.setTimeout(completeProgress, introProgressDurationMs);
    }

    function waitForStableFrames() {
      const startedWaitingAt = performance.now();
      const deadline = startedWaitingAt + 1200;
      let lastFrame = 0;
      let stableFrames = 0;

      function probe(now: number) {
        if (completed) return;

        if (lastFrame > 0) {
          const frameMs = now - lastFrame;
          stableFrames = frameMs <= introStableFrameBudgetMs ? stableFrames + 1 : 0;
        }
        lastFrame = now;

        if (
          (now - startedWaitingAt >= introStableFrameDelayMs && stableFrames >= 4) ||
          now >= deadline
        ) {
          beginProgress();
          return;
        }

        settleFrame = requestAnimationFrame(probe);
      }

      settleFrame = requestAnimationFrame(probe);
    }

    const start = () => {
      if (holdIntroForVisualTest) return;
      if (started || completed || !assetsReady || !uiReady) return;
      started = true;
      waitForStableFrames();
    };

    const markAssetsReady = () => {
      assetsReady = true;
      start();
    };
    const markUiReady = () => {
      uiReady = true;
      start();
    };

    window.addEventListener("lumen:intro-assets-ready", markAssetsReady, { once: true });
    window.addEventListener("lumen:route-visual-complete", markUiReady, { once: true });
    const fallbackTimer = window.setTimeout(markUiReady, 5200);
    start();

    return () => {
      cancelAnimationFrame(settleFrame);
      window.clearInterval(progressInterval);
      window.clearTimeout(progressTimer);
      window.clearTimeout(fallbackTimer);
      window.removeEventListener("lumen:intro-assets-ready", markAssetsReady);
      window.removeEventListener("lumen:route-visual-complete", markUiReady);
    };
  }
</script>

<RoutePathView
  module={routeModule}
  {busyExerciseId}
  {activationError}
  onNodeSelected={handleNodeSelected}
  onContinueRequest={handleContinueRequest}
/>

{#if introVisible}
  {#key introCycle}
    <div
      class:intro-assets-ready={introAssetsReady}
      class:intro-exiting={introExiting}
      class="lumen-intro"
      aria-hidden="true"
    >
      <div class="lumen-intro-mark">
        <img
          class="lumen-intro-logo"
          src={lumenBrand.logoUrl}
          alt=""
          width="92"
          height="92"
          loading="eager"
          decoding="sync"
          fetchpriority="high"
          draggable="false"
        />
        <img
          class="lumen-intro-wordmark"
          src={lumenBrand.wordmarkUrl}
          alt={lumenBrand.name}
          width="520"
          height="126"
          loading="eager"
          decoding="sync"
          fetchpriority="high"
          draggable="false"
        />
      </div>
      {#if introProgressVisible}
        <div class="lumen-intro-bar"><i style:transform={`scaleX(${introProgress / 100})`}></i></div>
        <p class="lumen-intro-percent">{Math.round(introProgress)}%</p>
      {/if}
    </div>
  {/key}
{/if}

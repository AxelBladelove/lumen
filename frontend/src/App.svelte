<script lang="ts">
  import { onDestroy, tick } from "svelte";
  import RoutePathView from "./route-path-view/RoutePathView.svelte";
  import { lumenBrand, ensureLumenFavicon } from "./brand/lumenBrand";
  import { scheduleAfterPaintOpportunities } from "./entry/frameBarrier";
  import { hasLayoutCommitGeometryChanged } from "./entry/layoutCommit";
  import {
    buildRouteModuleFromEngine,
    cloneRouteModule,
    createInitialRouteModule,
    engineRouteModuleDataSource,
    routeModuleDataSource
  } from "./route-path-view/data/routeModuleSource";
  import type { RoutePathNode } from "./route-path-view/types/routePath";
  import type { ExerciseDetailPayload } from "./webview/messages";
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
  // Último detail publicado por el host (protocolo v6 `exercise.detail.data`).
  // Tener datos no abre la vista: el CTA cambia a Detalles únicamente después
  // de que el ejercicio haya sido activado desde la ruta en esta sesión.
  let exerciseDetail: ExerciseDetailPayload | null = null;
  let detailPanelOpen = false;
  let activatedExerciseId: string | null = null;
  let activationTargetId: string | null = null;
  // El intro arranca visible siempre: en el host el panel solo existe durante
  // la entrada a Lumen Mode, y fuera del host es la unica pantalla de carga.
  let introVisible = true;
  let introCovering = false;
  let introExiting = false;
  let introAssetsReady = false;
  let introProgressVisible = staticIntroProgress > 0;
  let introProgress = staticIntroProgress;
  let introCycle = 0;
  let revealedPosted = false;
  let routeVisualReady = false;
  let stopIntroGate = () => {};
  let stopIntroProgress = () => {};
  let uiZoomOutTimer = 0;
  const introProgressDurationMs = 400;
  const introStableFrameDelayMs = 120;
  const introStableFrameBudgetMs = 26;
  const introRevealDurationMs = 280;
  const introFocusDurationMs = 120;
  // A 58 ms el punch-in ya cubre el lockup casi por completo. El host pide en
  // ese punto el frame seguro; dos oportunidades completas de presentación lo
  // confirman alrededor del pico óptico, sin añadir un hold terminal.
  const introLayoutHandoffAtMs = 58;
  const introUiZoomOutDurationMs = 120;

  // Protocolo de superficie segura: antes del movimiento de VS Code se pinta
  // la ruta congelada en el inicio exacto del landing. El token hace que sólo
  // el host que prearmó este ciclo pueda prepararlo y confirmarlo.
  type LayoutCommitPhase =
    | "idle"
    | "armed"
    | "scheduled"
    | "preparing"
    | "safe"
    | "committing"
    | "committed"
    | "settled";
  let layoutCommitPhase: LayoutCommitPhase = "idle";
  let layoutCommitToken: string | null = null;
  let layoutCommitSourceWidth = 0;
  let layoutCommitSourceHeight = 0;
  let stopSafeHandoffBarrier = () => {};
  let stopLandingStartFrame = () => {};
  let uiZoomOutStarted = false;

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
      if (activatedExerciseId && message.payload.activeExerciseId !== activatedExerciseId) {
        activatedExerciseId = null;
        detailPanelOpen = false;
      }
    }

    // Los completados llegan implícitos en el siguiente `route.module.data`:
    // el snapshot mueve `activeExerciseId` y `RoutePathView` anima el delta. El
    // mensaje explícito se ignora para no duplicar avances.

    if (message.type === "route.activation.state") {
      busyExerciseId = message.payload.busy?.exerciseId ?? null;
      activationError = message.payload.error?.message ?? null;
      if (message.payload.busy) {
        activationTargetId = message.payload.busy.exerciseId;
      } else if (activationTargetId) {
        if (!message.payload.error) activatedExerciseId = activationTargetId;
        activationTargetId = null;
      }
    }

    if (message.type === "exercise.detail.data") {
      const nextDetail = message.payload.detail;
      exerciseDetail = nextDetail;
      if (nextDetail === null) {
        detailPanelOpen = false;
      }
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

    if (message.type === "lumen.layoutCommitRequested") {
      armLayoutCommit(message.payload.token);
    }

    if (message.type === "lumen.layoutHandoffPrepare") {
      void prepareSafeLayoutHandoff(message.payload.token);
    }

    if (message.type === "lumen.layoutCommitted") {
      commitPreparedLayout(message.payload.token);
    }
  });

  // `frontend.ready` es también la barrera visual del Extension Host. No debe
  // salir durante el montaje síncrono: dos rAF garantizan que la cortina ya
  // atravesó al menos una pintura antes de permitir cerrar el sidebar/entrar
  // en Zen. Así un webview transparente nunca se expande a fullscreen.
  let readyPaintFrame = 0;
  let readySignalFrame = window.requestAnimationFrame(() => {
    readyPaintFrame = window.requestAnimationFrame(() => {
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
    });
  });

  const stopPerfReporting = setupPerfReporting();
  const stopIntroAssets = setupIntroAssets();
  stopIntroGate = setupIntroGate();
  stopIntroProgress = setupIntroProgress();

  // Escape dentro de la webview: la UI pide la salida de Lumen Mode por
  // protocolo. No depende del reenvio de keybindings de VS Code y sigue la
  // regla de exit-lumen-mode.md: lo temporal se cierra primero (el panel de
  // enunciado cuenta como UI temporal); si no hay nada temporal abierto,
  // se pide salir.
  function handleEscapeKey(event: KeyboardEvent) {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    if (detailPanelOpen) {
      detailPanelOpen = false;
      return;
    }
    bridge.post({ type: "lumen.exit.requested", payload: {} });
  }
  window.addEventListener("keydown", handleEscapeKey);

  $: detailActionAvailable = Boolean(
    exerciseDetail && activatedExerciseId === exerciseDetail.exerciseId
  );

  function openDetailPanel() {
    if (!exerciseDetail || !detailActionAvailable) return;
    detailPanelOpen = true;
  }

  function closeDetailPanel() {
    detailPanelOpen = false;
  }

  onDestroy(() => {
    window.cancelAnimationFrame(readySignalFrame);
    window.cancelAnimationFrame(readyPaintFrame);
    stopListening();
    stopPerfReporting();
    stopIntroAssets();
    stopIntroGate();
    stopIntroProgress();
    resetLayoutCommit();
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
    resetLayoutCommit();
    document.documentElement.classList.remove("lumen-ui-revealing");

    introCycle += 1;
    introVisible = true;
    introCovering = false;
    introExiting = false;
    introProgressVisible = false;
    introProgress = 0;
    revealedPosted = false;

    stopIntroGate = setupIntroGate();
    stopIntroProgress = setupIntroProgress();
  }

  function dismissIntroNow() {
    // `active` llega después de `frontend.revealed`, normalmente con el landing
    // ya asentado. Estas ramas defensivas nunca reinician una transición viva.
    if (layoutCommitPhase === "committing" || layoutCommitPhase === "committed") {
      return;
    }
    if (layoutCommitPhase === "settled") {
      postRevealedOnce();
      return;
    }

    resetLayoutCommit();
    stopIntroGate();
    stopIntroProgress();
    removeStaticIntro();
    document.documentElement.classList.remove("lumen-ui-revealing");
    introVisible = false;
    introCovering = false;
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

  function syncStaticIntroProgress(progress: number) {
    const clamped = Math.min(100, Math.max(0, progress));
    const staticState = (window as any).__LUMEN_STATIC_INTRO__;
    if (staticState) {
      staticState.controlled = true;
      staticState.progress = clamped;
    }
    const fill = document.getElementById("lumen-static-fill");
    const value = document.getElementById("lumen-static-percent-value");
    const bar = document.querySelector<HTMLElement>(".lumen-static-bar");
    if (fill) fill.style.transform = `scaleX(${(clamped / 100).toFixed(4)})`;
    if (value) value.textContent = String(Math.floor(clamped));
    bar?.setAttribute("aria-valuenow", String(Math.floor(clamped)));
  }

  function removeStaticIntro() {
    document.getElementById("lumen-static-intro")?.remove();
  }

  // El Extension Host usa esta señal como confirmación final, después de haber
  // El Extension Host usa esta señal como confirmación terminal. En la ruta de
  // extensión se emite al asentarse el landing, no al retirar la cortina.
  function postRevealedOnce() {
    if (revealedPosted) return;
    revealedPosted = true;
    bridge.post({ type: "frontend.revealed", payload: { token: layoutCommitToken } });
  }

  function resetLayoutCommit() {
    resetUiZoomOut();
    stopSafeHandoffBarrier();
    stopLandingStartFrame();
    stopSafeHandoffBarrier = () => {};
    stopLandingStartFrame = () => {};
    layoutCommitPhase = "idle";
    layoutCommitToken = null;
    layoutCommitSourceWidth = 0;
    layoutCommitSourceHeight = 0;
    document.documentElement.classList.remove(
      "lumen-ui-handoff-frozen",
      "lumen-ui-entering"
    );
  }

  function resetUiZoomOut() {
    window.clearTimeout(uiZoomOutTimer);
    uiZoomOutTimer = 0;
    uiZoomOutStarted = false;
  }

  function settleUiZoomOut() {
    if (!uiZoomOutStarted && layoutCommitPhase !== "committed") return;
    window.clearTimeout(uiZoomOutTimer);
    uiZoomOutTimer = 0;
    uiZoomOutStarted = false;
    removeStaticIntro();
    document.documentElement.classList.remove(
      "lumen-ui-handoff-frozen",
      "lumen-ui-entering"
    );
    layoutCommitPhase = "settled";
    performance.mark("lumen:ui-zoom-out-end");
    try {
      performance.measure(
        "lumen:ui-zoom-out",
        "lumen:ui-zoom-out-start",
        "lumen:ui-zoom-out-end"
      );
    } catch {
      // La telemetría nunca puede bloquear el asentamiento visual.
    }
    window.dispatchEvent(new Event("lumen:entry-transition-settled"));
    postRevealedOnce();
  }

  function beginUiZoomOutTelemetry() {
    if (uiZoomOutStarted) return;
    uiZoomOutStarted = true;
    performance.mark("lumen:ui-zoom-out-start");
    uiZoomOutTimer = window.setTimeout(() => {
      settleUiZoomOut();
    }, introUiZoomOutDurationMs + 80);
  }

  function handleUiZoomOutAnimationStart(event: AnimationEvent) {
    if (event.animationName !== "lumenUiZoomOut") return;
    beginUiZoomOutTelemetry();
  }

  function handleUiZoomOutAnimationEnd(event: AnimationEvent) {
    if (event.animationName !== "lumenUiZoomOut") return;
    settleUiZoomOut();
  }

  function handleUiZoomOutAnimationCancel(event: AnimationEvent) {
    if (event.animationName !== "lumenUiZoomOut") return;
    // Un cambio de accesibilidad, resize o navegación no puede dejar la ruta
    // atrapada a scale(1.11). Cancelar significa asentar, nunca reiniciar.
    settleUiZoomOut();
  }

  function armLayoutCommit(token: string) {
    if (!runningInExtensionHost || !introVisible || !token.trim()) return;
    if (token === layoutCommitToken && layoutCommitPhase !== "idle") {
      bridge.post({ type: "frontend.layoutCommitArmed", payload: { token } });
      return;
    }

    resetLayoutCommit();
    layoutCommitToken = token;
    layoutCommitPhase = "armed";
    layoutCommitSourceWidth = window.innerWidth;
    layoutCommitSourceHeight = window.innerHeight;
    performance.mark("lumen:layout-commit-armed");
    bridge.post({ type: "frontend.layoutCommitArmed", payload: { token } });
  }

  function scheduleLayoutCommit() {
    if (layoutCommitPhase !== "armed" || !layoutCommitToken) return false;

    // Recaptura para telemetría únicamente. La geometría nunca autoriza el
    // reveal: sólo lo hacen el token preparado y el commit explícito del host.
    layoutCommitSourceWidth = window.innerWidth;
    layoutCommitSourceHeight = window.innerHeight;
    layoutCommitPhase = "scheduled";
    performance.mark("lumen:layout-handoff-scheduled");
    return true;
  }

  async function prepareSafeLayoutHandoff(token: string) {
    if (token !== layoutCommitToken) return;
    if (layoutCommitPhase === "safe") {
      bridge.post({ type: "frontend.layoutHandoffPrepared", payload: { token } });
      return;
    }
    if (layoutCommitPhase !== "scheduled") return;

    layoutCommitPhase = "preparing";
    performance.mark("lumen:layout-handoff-prepare-start");

    // Congelar primero la ruta y retirar después ambas cortinas, en el mismo
    // task. El próximo frame ya es el keyframe inicial del zoom-out.
    document.documentElement.classList.add("lumen-ui-handoff-frozen");
    removeStaticIntro();
    introVisible = false;
    introCovering = false;
    introExiting = false;
    introProgressVisible = false;
    await tick();

    if (token !== layoutCommitToken || layoutCommitPhase !== "preparing") return;
    stopSafeHandoffBarrier = scheduleAfterPaintOpportunities({
      paintOpportunities: 2,
      requestFrame: (callback) => requestAnimationFrame(callback),
      cancelFrame: (handle) => cancelAnimationFrame(handle),
      onReady: () => {
        if (token !== layoutCommitToken || layoutCommitPhase !== "preparing") return;
        layoutCommitPhase = "safe";
        performance.mark("lumen:layout-handoff-safe-frame-painted");
        bridge.post({ type: "frontend.layoutHandoffPrepared", payload: { token } });
      }
    });
  }

  function commitPreparedLayout(token: string) {
    if (token !== layoutCommitToken) return;
    if (layoutCommitPhase === "settled") {
      postRevealedOnce();
      return;
    }
    if (layoutCommitPhase === "committing" || layoutCommitPhase === "committed") return;
    if (layoutCommitPhase !== "safe") return;

    // La promesa del comando de VS Code no es un evento de presentación. La
    // ruta permanece congelada hasta el siguiente frame propio del renderer;
    // sólo ahí se arma el landing, evitando iniciarlo durante el mismo task del
    // mensaje de commit.
    layoutCommitPhase = "committing";
    stopLandingStartFrame = scheduleAfterPaintOpportunities({
      paintOpportunities: 0,
      requestFrame: (callback) => requestAnimationFrame(callback),
      cancelFrame: (handle) => cancelAnimationFrame(handle),
      onReady: () => {
        if (token !== layoutCommitToken || layoutCommitPhase !== "committing") return;
        beginCommittedLayout(token);
      }
    });
  }

  function beginCommittedLayout(token: string) {
    if (token !== layoutCommitToken || layoutCommitPhase !== "committing") return;
    const geometryChanged = hasLayoutCommitGeometryChanged(
      { width: layoutCommitSourceWidth, height: layoutCommitSourceHeight },
      { width: window.innerWidth, height: window.innerHeight }
    );
    performance.mark(
      geometryChanged ? "lumen:layout-geometry-changed" : "lumen:layout-geometry-unchanged"
    );

    layoutCommitPhase = "committed";
    removeStaticIntro();
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduceMotion) document.documentElement.classList.add("lumen-ui-entering");
    document.documentElement.classList.remove("lumen-ui-handoff-frozen");
    beginUiZoomOutTelemetry();
    introVisible = false;
    introCovering = false;
    introExiting = false;
    introProgressVisible = false;
    performance.mark("lumen:intro-hidden");
    performance.mark("lumen:layout-commit-applied");
    try {
      performance.measure(
        "lumen:intro-focus-to-layout-commit",
        "lumen:intro-loading-complete",
        "lumen:layout-commit-applied"
      );
    } catch {
      // Métricas best-effort; el contrato visual ya está confirmado por token.
    }
    window.dispatchEvent(new Event("lumen:entry-transition-committed"));
    if (reduceMotion) settleUiZoomOut();
  }

  function handleIntroMarkAnimationEnd(event: AnimationEvent) {
    if (event.animationName !== "lumenIntroMarkFocus") return;
    window.dispatchEvent(new Event("lumen:intro-focus-complete"));
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
    const handleEntryTransitionCommitted = () => {
      schedule("entry-transition-committed", 0);
    };
    const handleEntryTransitionSettled = () => {
      schedule("entry-transition-settled", 0);
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
    window.addEventListener("lumen:entry-transition-committed", handleEntryTransitionCommitted);
    window.addEventListener("lumen:entry-transition-settled", handleEntryTransitionSettled);
    disposers.push(() => {
      window.removeEventListener("pointerdown", handleInteractionFocus);
      window.removeEventListener("focusin", handleInteractionFocus);
      window.removeEventListener("lumen:route-advance-started", handleRouteAdvance);
      window.removeEventListener("lumen:entry-transition-committed", handleEntryTransitionCommitted);
      window.removeEventListener("lumen:entry-transition-settled", handleEntryTransitionSettled);
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
    let handoffStarted = false;
    const reveal = async () => {
      if (cancelled || introAssetsReady || handoffStarted) return;
      handoffStarted = true;

      // El intro estático vive fuera de #app y permanece por encima durante
      // toda la carga y los resizes de Zen. Svelte queda preparado debajo; el
      // relevo visual se pospone al punch-in, cuando el layout ya es estable.
      introProgress = Math.max(introProgress, readStaticIntroProgress());
      introProgressVisible = true;
      introAssetsReady = true;
      await tick();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (cancelled) return;
      syncStaticIntroProgress(introProgress);
      window.dispatchEvent(new Event("lumen:intro-assets-ready"));
    };
    const fallbackTimer = window.setTimeout(() => void reveal(), 360);

    Promise.all([waitForImage(lumenBrand.logoUrl), waitForImage(lumenBrand.wordmarkUrl)])
      .then(() => void reveal())
      .catch(() => void reveal())
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
    let handoffReady = false;
    let cancelled = false;
    let staticHandoffFrame = 0;

    const beginReveal = () => {
      if (cancelled) return;
      performance.mark("lumen:intro-exit-start");
      document.documentElement.classList.add("lumen-ui-revealing");
      introCovering = false;
      introExiting = true;
      const hiddenTimer = window.setTimeout(() => {
        introVisible = false;
        introExiting = false;
        performance.mark("lumen:intro-hidden");
        document.documentElement.classList.remove("lumen-ui-revealing");
        postRevealedOnce();
      }, introRevealDurationMs);
      timers.push(hiddenTimer);
    };

    const scheduleHandoff = () => {
      if (cancelled || handoffReady) return;
      if (runningInExtensionHost && !scheduleLayoutCommit()) return;
      handoffReady = true;
      performance.mark("lumen:intro-handoff-scheduled");
      if (!runningInExtensionHost) {
        beginReveal();
        return;
      }
      bridge.post({
        type: "frontend.layoutHandoffReady",
        payload: { delayMs: introLayoutHandoffAtMs, token: layoutCommitToken! }
      });
    };

    const beginFocusZoom = () => {
      if (cancelled) return;
      introCovering = true;
      // La capa HTML evita el descarte de texturas observado durante los
      // resizes de Zen. Permanece encima hasta que el zoom Svelte ya arrancó
      // detrás y se retira justo en el siguiente frame.
      staticHandoffFrame = requestAnimationFrame(removeStaticIntro);
      // La marca cubre el punch-in hasta que el host pide el frame seguro. El
      // delay se ejecuta fuera del iframe; la UI sólo sustituye la cortina para
      // atravesar una pintura confirmada antes de cualquier movimiento.
      scheduleHandoff();
    };

    const finishIntro = () => {
      if (completed) return;
      completed = true;
      performance.mark("lumen:intro-loading-complete");
      // La barra termina fullscreen. El zoom al wordmark oculta los controles
      // antes de autorizar cualquier cambio de layout.
      beginFocusZoom();
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
      cancelAnimationFrame(staticHandoffFrame);
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
      syncStaticIntroProgress(introProgress);
      window.clearInterval(progressInterval);
      window.clearTimeout(progressTimer);
      window.dispatchEvent(new Event("lumen:intro-progress-complete"));
    }

    let progressBase = 0;

    function updateProgress() {
      if (completed) return;
      const progress = Math.min(1, (performance.now() - progressStartedAt) / introProgressDurationMs);
      introProgress = progress >= 1 ? 100 : Math.floor(progressBase + (100 - progressBase) * progress);
      syncStaticIntroProgress(introProgress);
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

<svelte:window
  on:animationstart={handleUiZoomOutAnimationStart}
  on:animationend={handleUiZoomOutAnimationEnd}
  on:animationcancel={handleUiZoomOutAnimationCancel}
/>

<div class="route-scene">
  <RoutePathView
    module={routeModule}
    {busyExerciseId}
    {activationError}
    {detailActionAvailable}
    detail={exerciseDetail}
    detailOpen={detailPanelOpen}
    detailTitle={exerciseDetail?.title ?? ""}
    onNodeSelected={handleNodeSelected}
    onContinueRequest={handleContinueRequest}
    onDetailRequest={openDetailPanel}
    onDetailClose={closeDetailPanel}
  />
</div>

{#if introVisible}
  {#key introCycle}
    <div
      class:intro-assets-ready={introAssetsReady}
      class:intro-covering={introCovering}
      class:intro-exiting={introExiting}
      class="lumen-intro"
      aria-hidden="true"
    >
      <div class="lumen-intro-mark" on:animationend={handleIntroMarkAnimationEnd}>
        <span class="lumen-intro-chromatic lumen-intro-chromatic-red">
          <img src={lumenBrand.logoUrl} alt="" width="92" height="92" draggable="false" />
          <img src={lumenBrand.wordmarkUrl} alt="" width="520" height="126" draggable="false" />
        </span>
        <span class="lumen-intro-chromatic lumen-intro-chromatic-cyan">
          <img src={lumenBrand.logoUrl} alt="" width="92" height="92" draggable="false" />
          <img src={lumenBrand.wordmarkUrl} alt="" width="520" height="126" draggable="false" />
        </span>
        <span class="lumen-intro-primary">
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
        </span>
      </div>
      {#if introProgressVisible}
        <div class="lumen-intro-bar"><i style:transform={`scaleX(${introProgress / 100})`}></i></div>
        <p class="lumen-intro-percent">{Math.round(introProgress)}%</p>
      {/if}
    </div>
  {/key}
{/if}

<style>
  .route-scene {
    width: 100%;
    height: 100%;
  }
</style>

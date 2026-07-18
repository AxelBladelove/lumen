<script lang="ts">
  import { onMount } from "svelte";
  import ExerciseDetailPanel from "../exercise-detail/ExerciseDetailPanel.svelte";
  import type { ExerciseDetailPayload, ExerciseRunKind } from "../webview/messages";
  import BottomCta from "./components/BottomCta.svelte";
  import ProgressCard from "./components/ProgressCard.svelte";
  import RouteHeader from "./components/RouteHeader.svelte";
  import TramoComposition from "./components/TramoComposition.svelte";
  import { createPathSampler, type PathSampler } from "./path/pathMetrics";
  import { createTramoPath } from "./path/tramoPaths";
  import {
    partitionModuleNodes,
    projectModuleNodes,
    selectVisibleTramoIndex
  } from "./state/moduleTramos";
  import {
    createTramoTransition,
    requestTramoTransition,
    settleTramoTransition,
    type TramoTransitionDirection
  } from "./state/tramoTransition";
  import { nextTramoDemoIndex, tramoDemoDelayMs } from "./state/tramoDemo";
  import { themeVars } from "./theme/moduleTheme";
  import type { NodeMotion, NodeStatus, RoutePathModuleView, RoutePathNode } from "./types/routePath";

  export let module: RoutePathModuleView;
  export let moduleDataLoading = false;
  export let onNodeSelected: ((node: RoutePathNode) => void) | undefined = undefined;
  export let onContinueRequest:
    | ((payload: { fromNodeId?: string; nextNodeId?: string }) => void)
    | undefined = undefined;
  // Estado autoritativo empujado por el Extension Host: `busy` señala que el
  // engine está activando/abriendo un ejercicio; `error` el último fallo de
  // activación. La UI solo renderiza (no invita) y no adelanta la ruta.
  export let busyExerciseId: string | null = null;
  export let activationError: string | null = null;
  export let detailActionAvailable = false;
  export let detail: ExerciseDetailPayload | null = null;
  export let detailOpen = false;
  export let detailTitle = "";
  export let onDetailRequest: (() => void) | undefined = undefined;
  export let onDetailClose: (() => void) | undefined = undefined;
  export let exerciseRunActive: ExerciseRunKind | null = null;
  export let onExerciseRunRequest: ((kind: ExerciseRunKind) => void) | undefined = undefined;

  const stage = { width: 1086, height: 1448 };
  let scale = 1;
  let layoutWidth = stage.width;
  let layoutHeight = stage.height;
  let contentOffset = 0;
  let compactLayout = false;
  let compactProgress = 0;
  let headerLabelReveal = 1;
  let routeArtScale = 1;
  let detailSnakeShift = -48;
  let detailContentInset = 0;
  let detailContentScale = 1;
  let detailHeroShift = 0;
  let detailHeroShiftY = -33;
  let detailHeroScale = 1.55;
  let appRoot: HTMLElement;
  let detailRendered = detailOpen;
  let detailEntering = false;
  let detailExiting = false;
  let observedDetailOpen = detailOpen;
  let detailEnterTimer = 0;
  let detailExitTimer = 0;
  let displayedLockedStartT = 0;
  let splitAnimationFrame = 0;
  let splitAnimationTarget = -1;
  let splitAnimationReady = false;
  let isAdvancing = false;
  let advanceCommitDone = false;
  let mounted = false;
  let deferredVisualsReady = false;
  let pathSampler: PathSampler | null =
    typeof document !== "undefined" && module?.path?.pathD
      ? createPathSampler(module.path.pathD, module.path.transform)
      : null;
  let nodeMotionById: Record<string, NodeMotion> = {};
  let nodeMotionTimers: number[] = [];
  let reviewNodeId: string | null = null;
  // Hook visual opt-in: recorre tramos mediante el reconciliador productivo.
  const tramoDemoEnabled =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).has("lumenTramoDemo");
  let tramoDemoIndex = 0;
  let tramoDemoTimer = 0;
  // En demo los tramos se acortan para garantizar al menos dos y poder
  // comprobar el scroll aun con módulos que caben en una sola vista.
  const tramoPreferredSize = tramoDemoEnabled ? 4 : undefined;
  const initialProjectedNodes = projectModuleNodes(module.nodes, tramoPreferredSize);
  const initialTramos = partitionModuleNodes(initialProjectedNodes, tramoPreferredSize);
  const initialActiveExerciseId =
    module.activeExerciseId ?? initialProjectedNodes.find((node) => node.status === "active")?.id;
  const initialModuleCompleted = module.total > 0 && module.completed >= module.total;
  const initialTramoIndex = tramoDemoEnabled
    ? 0
    : selectVisibleTramoIndex(
        initialTramos,
        initialActiveExerciseId,
        initialModuleCompleted
      );
  let tramoTransition = createTramoTransition(initialTramoIndex);
  let tramoDataObserved = !moduleDataLoading;
  let tramoRender:
    | {
        primaryTramoIndex: number;
        targetTramoIndex: number;
        direction: TramoTransitionDirection;
      }
    | null = null;
  let tramoTrackAnimating = false;
  let incomingTramoReady = false;
  let tramoStartFrame = 0;
  let tramoHandoffFrame = 0;
  let tramoHandoffSettleFrame = 0;
  let tramoReadyTimer = 0;
  let tramoScrollMarked = false;
  let pendingTramoIndex: number | null = null;
  let pendingTramoLockedStartT = 1;
  const tramoReadyTimeoutMs = 2_400;
  const routeAnimationDuration = 860;
  const routeStartKick = 0.1;
  const routeNodeCommitFallbackProgress = 0.4;
  const nodeEdgeCommitRadius = 25;
  const nodeMotionDuration = 720;

  function updateScale() {
    // El host ya delimita visualmente el panel con su sash. Reservar margen
    // horizontal aquí producía una segunda franja oscura artificial entre el
    // borde redimensionable de VS Code y el comienzo real de Lumen.
    const marginX = 0;
    const marginY = 22;
    const availableWidth = window.innerWidth - marginX;
    const availableHeight = window.innerHeight - marginY;
    // En paneles angostos (Lumen como columna derecha del editor) el layout se
    // compacta antes de bajar la escala global: el chrome anclado a bordes
    // conserva tamano legible y la ruta/snake absorbe el ajuste visual.
    const isNarrowPanel = availableWidth < 820;
    // La geometría se interpola durante 240 px en vez de cambiar de preset en
    // el breakpoint. `compactLayout` sólo decide cuándo ocultar las etiquetas
    // de las pills; ninguna posición ni escala depende ya de ese booleano.
    compactProgress = Math.max(0, Math.min(1, (860 - availableWidth) / 240));
    // Las etiquetas se apagan antes de que las pills comiencen a ser demasiado
    // estrechas. Icono y etiqueta forman una sola unidad óptica: el ancho de la
    // etiqueta colapsa y esa unidad permanece centrada durante todo el resize.
    headerLabelReveal = Math.max(0, Math.min(1, (availableWidth - 820) / 30));
    const compactLayoutWidth = 860 - 160 * compactProgress;
    const compactStageHeight = stage.height - (stage.height - 1304) * compactProgress;
    const heightFit = Math.min(1, availableHeight / compactStageHeight);
    const widthFit = availableWidth / compactLayoutWidth;
    // La altura es autoritativa: Lumen debe caber completa en el viewport y no
    // convertir una vista corta en una página desplazable. El ancho puede
    // comprimirla todavía más, pero nunca forzar una escala mayor al heightFit.
    let nextScale = Math.max(0.08, Math.min(1, heightFit, widthFit));
    // Zona ultra-angosta: el layout mínimo también debe caber completo.
    const minLayoutWidth = 540;
    if (minLayoutWidth * nextScale > availableWidth) {
      nextScale = Math.max(0.08, availableWidth / minLayoutWidth);
    }
    const expandedWidth = availableWidth / nextScale;
    compactLayout = isNarrowPanel;
    scale = nextScale;
    layoutHeight = compactStageHeight;
    layoutWidth = Math.max(minLayoutWidth, Math.min(2200, expandedWidth));
    contentOffset = (layoutWidth - stage.width) / 2;
    routeArtScale = 1 - 0.1 * compactProgress;
    // Detalles se abre espacialmente cuando hay ancho real: la ruta se aparta
    // hacia la izquierda y la columna editorial gana parte del centro libre.
    const positiveOffset = Math.max(0, contentOffset);
    detailSnakeShift = -48 - Math.min(240, positiveOffset * 0.72);
    detailContentInset = Math.min(120, positiveOffset * 0.3);
    detailContentScale = 1 + Math.min(0.13, positiveOffset * 0.00045);
    // El hero mantiene su caja original y se desplaza con transform. Así el
    // zoom, el desenfoque y el fade comparten una única animación continua.
    detailHeroShift = layoutWidth - contentOffset - 983;
    detailHeroShiftY = -33 + 40 * compactProgress;
    detailHeroScale = 1.55 + 0.14 * compactProgress;
    if (appRoot) appRoot.scrollTop = 0;
  }

  onMount(() => {
    performance.mark("lumen:route-mounted");
    mounted = true;
    updateScale();
    window.addEventListener("resize", updateScale);
    displayedLockedStartT = lockedStartT;
    splitAnimationTarget = lockedStartT;
    splitAnimationReady = true;
    loadDeferredVisuals();
    if (tramoDemoEnabled) scheduleTramoDemoAdvance();

    return () => {
      window.removeEventListener("resize", updateScale);
      cancelAnimationFrame(splitAnimationFrame);
      cancelAnimationFrame(tramoStartFrame);
      cancelAnimationFrame(tramoHandoffFrame);
      cancelAnimationFrame(tramoHandoffSettleFrame);
      window.clearTimeout(tramoReadyTimer);
      window.clearTimeout(tramoDemoTimer);
      window.clearTimeout(detailEnterTimer);
      window.clearTimeout(detailExitTimer);
      nodeMotionTimers.forEach((timer) => window.clearTimeout(timer));
    };
  });

  // El cierre conserva la composición montada durante todo el zoom-out. Sin
  // esta fase local, el prop externo desmonta detalles en el mismo frame del
  // click y sólo quedan transiciones parciales de los elementos de la ruta.
  $: if (detailOpen !== observedDetailOpen) {
    observedDetailOpen = detailOpen;
    if (detailOpen) {
      window.clearTimeout(detailEnterTimer);
      window.clearTimeout(detailExitTimer);
      detailRendered = true;
      detailEntering = true;
      detailExiting = false;
      detailEnterTimer = window.setTimeout(() => {
        detailEntering = false;
      }, 820);
    } else if (mounted && detailRendered) {
      window.clearTimeout(detailEnterTimer);
      detailEntering = false;
      detailExiting = true;
      detailExitTimer = window.setTimeout(() => {
        detailRendered = false;
        detailExiting = false;
      }, 820);
    }
  }

  function loadDeferredVisuals() {
    (window as any).__LUMEN_DEFERRED_STATUS__ = {
      ...(window as any).__LUMEN_DEFERRED_STATUS__,
      routeVisuals: "loading"
    };

    deferredVisualsReady = true;
    (window as any).__LUMEN_DEFERRED_STATUS__.routeVisuals = "loaded";
  }

  // Índice mostrado en pantalla. Nunca se muta desde clicks del usuario: solo
  // reacciona al snapshot que empuja el engine (via el Extension Host).
  let activeNodeIndex = -1;

  $: projectedModuleNodes = projectModuleNodes(module.nodes, tramoPreferredSize);
  $: snapshotActiveIndex = projectedModuleNodes.findIndex((node) => node.status === "active");
  $: snapshotActiveExerciseId =
    module.activeExerciseId ?? projectedModuleNodes[snapshotActiveIndex]?.id;
  $: moduleCompleted = module.total > 0 && module.completed >= module.total;
  // Sincroniza el índice mostrado con el snapshot. Si el snapshot avanza a un
  // índice mayor, corre la animación forward y transitions. Si retrocede o es
  // el mismo, ajusta sin animar (los saltos hacia atrás sólo pasan por
  // resnapshots del engine, nunca por click). `activeNodeIndex < 0` es el
  // primer render: se posiciona sin animación.
  $: if (
    mounted &&
    splitAnimationReady &&
    !moduleDataLoading &&
    !isAdvancing &&
    snapshotActiveIndex !== activeNodeIndex
  ) {
    reconcileToSnapshotActive(snapshotActiveIndex);
  }
  $: interactiveNodes = projectedModuleNodes.map((node, index) => ({
    ...node,
    status: statusForNode(node, index, activeNodeIndex),
    motion: nodeMotionById[node.id],
    reviewMode: node.id === reviewNodeId && index < activeNodeIndex ? "repeat" as const : undefined
  }));
  $: moduleTramos = partitionModuleNodes(interactiveNodes, tramoPreferredSize);
  $: snapshotTramoIndex = selectVisibleTramoIndex(
    moduleTramos,
    snapshotActiveExerciseId,
    moduleCompleted
  );
  $: requestedTramoIndex = tramoDemoEnabled
    ? clampTramoIndex(tramoDemoIndex, moduleTramos.length)
    : snapshotTramoIndex;
  $: if (mounted && moduleTramos.length) {
    reconcileTramoSelection(
      requestedTramoIndex,
      moduleDataLoading,
      lockedStartForNodes(moduleTramos[requestedTramoIndex] ?? [])
    );
  }
  $: settledTramoIndex = clampTramoIndex(tramoTransition.visibleTramoIndex, moduleTramos.length);
  $: primaryTramoIndex = clampTramoIndex(
    tramoRender?.primaryTramoIndex ?? settledTramoIndex,
    moduleTramos.length
  );
  $: incomingTramoIndex = clampTramoIndex(
    tramoRender?.targetTramoIndex ?? settledTramoIndex,
    moduleTramos.length
  );
  $: primaryTramoNodes = moduleTramos[primaryTramoIndex] ?? [];
  $: incomingTramoNodes = moduleTramos[incomingTramoIndex] ?? [];
  $: primaryTramoPath = createTramoPath(module.path, primaryTramoIndex);
  $: incomingTramoPath = createTramoPath(module.path, incomingTramoIndex);
  $: primaryLockedStartT = tramoRender
    ? lockedStartForNodes(primaryTramoNodes)
    : displayedLockedStartT;
  $: incomingLockedStartT = lockedStartForNodes(incomingTramoNodes);
  $: if (primaryTramoPath?.pathD) {
    pathSampler = createPathSampler(primaryTramoPath.pathD, primaryTramoPath.transform);
  }
  $: activeNode = interactiveNodes.find((node) => node.status === "active");
  $: firstLockedNode = interactiveNodes.find((node) => node.status === "locked");
  $: lockedStartT = activeNode
    ? activeNode.pathT
    : firstLockedNode?.pathT ?? 1;
  $: if (!splitAnimationReady) {
    displayedLockedStartT = lockedStartT;
  }
  // Todos los contadores son autoritativos del engine: no se inflan localmente.
  $: completedCount = module.completed;
  $: completionPercent = module.percent;
  $: nextTargetTitle = module.nextAction.targetTitle || "Módulo completado";
  $: canContinue =
    Boolean(activeNode) &&
    !moduleDataLoading &&
    !isAdvancing &&
    !busyExerciseId &&
    tramoTransition.phase !== "scrolling" &&
    !tramoRender;
  $: ctaLabel = detailActionAvailable ? "Detalles:" : module.nextAction.label;
  $: ctaTargetTitle = detailActionAvailable ? detailTitle || activeNode?.title || nextTargetTitle : nextTargetTitle;

  function statusForNode(node: RoutePathNode, _index: number, _currentIndex: number): NodeStatus {
    // `challenge` is a visual treatment for a locked challenge, not a locally
    // invented progression state. All unlock/completion authority stays in Rust.
    if (node.status === "locked" && node.type === "challenge") return "challenge";
    return node.status;
  }

  function scheduleTramoDemoAdvance() {
    window.clearTimeout(tramoDemoTimer);
    tramoDemoTimer = window.setTimeout(() => {
      // Durante la carga la reconciliación corta sin animar; el demo espera a
      // que resuelva para mostrar el scroll real.
      if (moduleDataLoading) {
        scheduleTramoDemoAdvance();
        return;
      }
      const nextIndex = nextTramoDemoIndex(tramoDemoIndex, moduleTramos.length);
      if (nextIndex === null) return;

      tramoDemoIndex = nextIndex;
      if (nextTramoDemoIndex(tramoDemoIndex, moduleTramos.length) !== null) {
        scheduleTramoDemoAdvance();
      }
    }, tramoDemoDelayMs);
  }

  function reconcileTramoSelection(
    targetTramoIndex: number,
    loading: boolean,
    targetLockedStartT: number
  ) {
    // La primera data autoritativa encaja directamente. El mock puede estar
    // pintado bajo el intro, pero nunca debe provocar un scroll de bienvenida.
    if (!tramoDataObserved) {
      if (loading) return;
      tramoDataObserved = true;
      tramoTransition = createTramoTransition(targetTramoIndex);
      displayedLockedStartT = targetLockedStartT;
      return;
    }

    if (tramoRender && targetTramoIndex !== tramoTransition.targetTramoIndex) {
      pendingTramoIndex = targetTramoIndex;
      pendingTramoLockedStartT = targetLockedStartT;
      return;
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const nextTransition = requestTramoTransition(
      tramoTransition,
      targetTramoIndex,
      reducedMotion
    );
    if (nextTransition === tramoTransition) return;

    tramoTransition = nextTransition;
    if (nextTransition.phase !== "scrolling") {
      cancelAnimationFrame(tramoStartFrame);
      window.clearTimeout(tramoReadyTimer);
      tramoTrackAnimating = false;
      tramoRender = null;
      incomingTramoReady = false;
      return;
    }

    tramoTrackAnimating = false;
    incomingTramoReady = false;
    tramoScrollMarked = false;
    window.clearTimeout(tramoReadyTimer);
    tramoReadyTimer = window.setTimeout(settleUnreadyTramoDirectly, tramoReadyTimeoutMs);
    tramoRender = {
      primaryTramoIndex: nextTransition.visibleTramoIndex,
      targetTramoIndex: nextTransition.targetTramoIndex,
      direction: nextTransition.direction
    };
  }

  function handleIncomingTramoReady() {
    if (incomingTramoReady || tramoTransition.phase !== "scrolling" || !tramoRender) return;
    incomingTramoReady = true;
    window.clearTimeout(tramoReadyTimer);
    cancelAnimationFrame(tramoStartFrame);
    // El segundo frame garantiza que el canvas entrante ya atravesó una
    // pintura fuera del viewport antes de comenzar el desplazamiento.
    tramoStartFrame = requestAnimationFrame(() => {
      tramoStartFrame = requestAnimationFrame(() => {
        if (tramoTransition.phase === "scrolling" && tramoRender) {
          tramoTrackAnimating = true;
        }
      });
    });
  }

  function handleTramoAnimationStart(event: AnimationEvent) {
    if (event.target !== event.currentTarget || !event.animationName.startsWith("tramoScroll")) return;
    if (tramoScrollMarked) return;
    tramoScrollMarked = true;
    performance.mark("lumen:tramo-scroll-start");
  }

  function handleTramoAnimationEnd(event: AnimationEvent) {
    if (event.target !== event.currentTarget || !event.animationName.startsWith("tramoScroll")) return;
    settleRenderedTramo();
  }

  function settleRenderedTramo() {
    if (!tramoRender || tramoTransition.phase !== "scrolling") return;
    window.clearTimeout(tramoReadyTimer);
    performance.mark("lumen:tramo-scroll-end");
    try {
      performance.measure(
        "lumen:tramo-scroll",
        "lumen:tramo-scroll-start",
        "lumen:tramo-scroll-end"
      );
    } catch {
      // Las marcas son telemetría best-effort y nunca frenan el handoff.
    }

    const targetTramoIndex = tramoRender.targetTramoIndex;
    tramoTransition = settleTramoTransition(tramoTransition);
    // El canvas primario adopta el destino mientras sigue fuera de pantalla;
    // el entrante permanece visible dos frames y evita un frame vacío al swap.
    tramoRender = { ...tramoRender, primaryTramoIndex: targetTramoIndex };
    cancelAnimationFrame(tramoHandoffFrame);
    cancelAnimationFrame(tramoHandoffSettleFrame);
    tramoHandoffFrame = requestAnimationFrame(() => {
      tramoHandoffSettleFrame = requestAnimationFrame(() => {
        tramoTrackAnimating = false;
        tramoRender = null;
        incomingTramoReady = false;
        tramoScrollMarked = false;
        flushPendingTramo();
      });
    });
  }

  function settleUnreadyTramoDirectly() {
    if (incomingTramoReady || !tramoRender || tramoTransition.phase !== "scrolling") return;
    // No es un renderer alternativo: el canvas primario conserva materiales y
    // adopta el nuevo path directamente si el prewarm auxiliar no confirma.
    tramoTransition = settleTramoTransition(tramoTransition);
    displayedLockedStartT = lockedStartForNodes(
      moduleTramos[tramoTransition.visibleTramoIndex] ?? []
    );
    tramoTrackAnimating = false;
    tramoRender = null;
    tramoScrollMarked = false;
    flushPendingTramo();
  }

  function flushPendingTramo() {
    if (pendingTramoIndex === null) return;
    const targetTramoIndex = pendingTramoIndex;
    const targetLockedStartT = pendingTramoLockedStartT;
    pendingTramoIndex = null;
    reconcileTramoSelection(targetTramoIndex, false, targetLockedStartT);
  }

  function lockedStartForNodes(nodes: RoutePathNode[]) {
    const active = nodes.find((node) => node.status === "active");
    if (active) return active.pathT;
    const locked = nodes.find((node) => node.status === "locked" || node.status === "challenge");
    return locked?.pathT ?? 1;
  }

  function clampTramoIndex(index: number, tramoCount: number) {
    return Math.max(0, Math.min(Math.max(0, tramoCount - 1), index));
  }

  function continueToNextNode() {
    if (detailActionAvailable) {
      onDetailRequest?.();
      return;
    }
    performance.mark("lumen:continue-pressed");
    // La UI ya no adelanta la ruta: solo delega en el Extension Host. La
    // animación se dispara cuando llegue un snapshot con nuevo activeExerciseId.
    onContinueRequest?.({
      fromNodeId: activeNode?.id
    });
  }

  function handleNodeSelect(node: RoutePathNode) {
    onNodeSelected?.(node);

    const selectedIndex = module.nodes.findIndex((candidate) => candidate.id === node.id);
    if (selectedIndex < 0) return;

    if (node.status === "completed") {
      reviewNodeId = reviewNodeId === node.id ? null : node.id;
      return;
    }

    if (selectedIndex === activeNodeIndex) {
      reviewNodeId = null;
    }
  }

  function reconcileToSnapshotActive(targetIndex: number) {
    const targetNode = projectedModuleNodes[targetIndex];

    if (activeNodeIndex < 0) {
      activeNodeIndex = targetIndex;
      if (targetNode) displayedLockedStartT = targetNode.pathT;
      return;
    }

    if (!targetNode || targetIndex <= activeNodeIndex) {
      // Snapshot retrocedió (reimport, recarga) o no cambió: encaje directo.
      activeNodeIndex = targetIndex;
      displayedLockedStartT = targetNode?.pathT ?? 1;
      return;
    }

    // Solo avanzar (targetIndex > activeNodeIndex): un paso a la vez basta para
    // el módulo strings; si el engine reporta un salto múltiple, animar al
    // final directo es aceptable y respeta el contrato "renderiza el snapshot".
    const previousNode = projectedModuleNodes[activeNodeIndex];
    isAdvancing = true;
    advanceCommitDone = false;
    reviewNodeId = null;
    performance.mark("lumen:route-advance-start");
    window.dispatchEvent(new CustomEvent("lumen:route-advance-started"));
    const commitAtT = nodeEdgeCommitT(displayedLockedStartT, targetNode);

    animateUnlockedRoute(displayedLockedStartT, targetNode.pathT, commitAtT, () => {
      activeNodeIndex = targetIndex;
      displayedLockedStartT = targetNode.pathT;
      isAdvancing = false;
    }, () => {
      if (advanceCommitDone) return;
      advanceCommitDone = true;
      activeNodeIndex = targetIndex;
      playNodeTransition(previousNode, targetNode);
    });
  }

  function playNodeTransition(previousNode: RoutePathNode | undefined, targetNode: RoutePathNode) {
    const nextMotionById = { ...nodeMotionById, [targetNode.id]: "unlock" as NodeMotion };
    if (previousNode) {
      nextMotionById[previousNode.id] = "complete";
    }
    nodeMotionById = nextMotionById;

    const transitionIds = [previousNode?.id, targetNode.id].filter(Boolean) as string[];
    const timer = window.setTimeout(() => {
      const remainingMotions = { ...nodeMotionById };
      transitionIds.forEach((id) => delete remainingMotions[id]);
      nodeMotionById = remainingMotions;
      nodeMotionTimers = nodeMotionTimers.filter((motionTimer) => motionTimer !== timer);
    }, nodeMotionDuration);
    nodeMotionTimers = [...nodeMotionTimers, timer];
  }

  function nodeEdgeCommitT(from: number, targetNode: RoutePathNode) {
    if (!pathSampler?.totalLength) {
      return from + (targetNode.pathT - from) * routeNodeCommitFallbackProgress;
    }

    const edgeInsetT = nodeEdgeCommitRadius / pathSampler.totalLength;
    return Math.max(from, Math.min(targetNode.pathT, targetNode.pathT - edgeInsetT));
  }

  function easeRouteTravel(t: number) {
    if (t < 0.18) {
      const local = t / 0.18;
      return 0.22 * (1 - Math.pow(1 - local, 2));
    }
    const local = (t - 0.18) / 0.82;
    return 0.22 + 0.78 * (1 - Math.pow(1 - local, 3));
  }

  function animateUnlockedRoute(
    from: number,
    to: number,
    commitAtT: number,
    onComplete?: () => void,
    onReachNode?: () => void
  ) {
    cancelAnimationFrame(splitAnimationFrame);
    splitAnimationTarget = to;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion || to <= from) {
      displayedLockedStartT = to;
      onReachNode?.();
      onComplete?.();
      return;
    }

    const startTime = performance.now();
    const duration = routeAnimationDuration;
    const startKick = routeStartKick;
    displayedLockedStartT = from + (to - from) * startKick;
    performance.mark("lumen:route-advance-kick");
    progressFrameNotMarked = true;

    function tick(now: number) {
      if (progressFrameNotMarked) {
        performance.mark("lumen:route-advance-first-frame");
        progressFrameNotMarked = false;
      }
      const progress = Math.min(1, (now - startTime) / duration);
      const easedProgress = startKick + (1 - startKick) * easeRouteTravel(progress);
      displayedLockedStartT = from + (to - from) * easedProgress;

      if (!advanceCommitDone && displayedLockedStartT >= commitAtT) {
        onReachNode?.();
      }

      if (progress < 1) {
        splitAnimationFrame = requestAnimationFrame(tick);
      } else {
        displayedLockedStartT = to;
        onReachNode?.();
        onComplete?.();
      }
    }

    splitAnimationFrame = requestAnimationFrame(tick);
  }

  let progressFrameNotMarked = false;
</script>

<main
  bind:this={appRoot}
  class="lumen-route-app"
  class:compact-layout={compactLayout}
  class:route-busy={Boolean(busyExerciseId)}
  aria-busy={moduleDataLoading || Boolean(busyExerciseId)}
  style={themeVars(module.theme)}
>
  <div
    class="stage-viewport"
    class:compact={compactLayout}
    style={`width:${layoutWidth * scale}px; height:${layoutHeight * scale}px;`}
  >
    <section
      class="route-stage"
      class:compact={compactLayout}
      class:detail-mode={detailRendered && !detailExiting}
      class:detail-entering={detailEntering}
      class:detail-exiting={detailExiting}
      aria-label={`${module.routeTitle}, módulo ${module.moduleNumber}: ${module.title}`}
      style={`--stage-scale:${scale}; --layout-width:${layoutWidth}px; --stage-height:${layoutHeight}px; --content-offset:${contentOffset}px; --compact-progress:${compactProgress}; --header-label-reveal:${headerLabelReveal}; --route-art-scale:${routeArtScale}; --route-base-shift-y:${-18 * compactProgress}px; --route-base-origin-y:${50 + 5 * compactProgress}%; --detail-snake-shift:${detailSnakeShift}px; --detail-content-inset:${detailContentInset}px; --detail-content-scale:${detailContentScale}; --detail-content-top:${350 - 58 * compactProgress}px; --detail-examples-gap:${58 - 14 * compactProgress}px; --detail-hero-shift:${detailHeroShift}px; --detail-hero-shift-y:${detailHeroShiftY}px; --detail-hero-scale:${detailHeroScale}; --hero-left-nudge:${16 * compactProgress}px; --hero-top:${374 - 24 * compactProgress}px; --hero-size:${372 - 32 * compactProgress}px; --back-left:${36 - 4 * compactProgress}px; --back-top:${49 - 5 * compactProgress}px; --back-width:${174 - 88 * compactProgress}px; --modules-right:${44 - 4 * compactProgress}px; --modules-top:${55 - 11 * compactProgress}px; --modules-width:${172 - 86 * compactProgress}px; --modules-height:${65 + 3 * compactProgress}px; --title-left:${(layoutWidth - Math.min(540, layoutWidth - 252)) / 2}px; --title-width:${Math.min(540, layoutWidth - 252)}px; --title-top:${38 - 2 * compactProgress}px; --title-kicker-size:${19 - compactProgress}px; --title-heading-top:${37 - 3 * compactProgress}px; --title-heading-size:${(1 - compactProgress) * 42 + compactProgress * Math.max(24, Math.min(36, (layoutWidth - 252) * 0.094))}px; --title-subtitle-top:${88 - 6 * compactProgress}px; --title-subtitle-size:${(1 - compactProgress) * 26 + compactProgress * Math.max(17, Math.min(23, (layoutWidth - 252) * 0.07))}px; --progress-inset:${59 - 21 * compactProgress}px; --progress-top:${189 - 17 * compactProgress}px; --progress-height:${126 - 22 * compactProgress}px; --progress-radius:${21 - 3 * compactProgress}px; --progress-metric-top:${30 - 6 * compactProgress}px; --progress-metric-left:${28 - 4 * compactProgress}px; --progress-metric-right:${29 - 5 * compactProgress}px; --progress-strong-size:${28 - 3 * compactProgress}px; --progress-strong-line:${31 - 4 * compactProgress}px; --progress-span-size:${22 - 3 * compactProgress}px; --progress-span-line:${25 - 3 * compactProgress}px; --segments-inset:${29 - 5 * compactProgress}px; --segments-top:${81 - 14 * compactProgress}px; --segments-gap:${8 - 2 * compactProgress}px; --segment-min:${34 * (1 - compactProgress)}px; --segment-height:${12 - 2 * compactProgress}px; --cta-inset:${72 - 24 * compactProgress}px; --cta-top:${1300 - 112 * compactProgress}px; --cta-height:${100 - 14 * compactProgress}px; --cta-radius:${21 - 3 * compactProgress}px; --cta-icon-left:${36 - 8 * compactProgress}px; --cta-icon-top:${33 - 6 * compactProgress}px; --cta-icon-size:${39 - 7 * compactProgress}px; --cta-text-left:${112 - 28 * compactProgress}px; --cta-text-right:${112 - 16 * compactProgress}px; --cta-text-top:${34 - 5 * compactProgress}px; --cta-text-size:${21 - 2 * compactProgress}px; --cta-text-line:${26 - 2 * compactProgress}px; --cta-button-right:${32 - 6 * compactProgress}px; --cta-button-top:${18 - 2 * compactProgress}px; --cta-button-size:${63 - 9 * compactProgress}px; --cta-button-radius:${18 - 2 * compactProgress}px; --cta-detail-padding:${14 - 3 * compactProgress}px; --cta-detail-icon-size:${31 - compactProgress}px; --cta-detail-hover-width:${126 + 64 * compactProgress}px; --cta-hover-text-right:${174 + 54 * compactProgress}px;`}
    >
      <div class="background-layer"></div>

      {#if deferredVisualsReady}
        <div
          class="tramo-composition-rail"
          class:tramo-forward={tramoRender?.direction === "forward"}
          class:tramo-backward={tramoRender?.direction === "backward"}
          class:tramo-animating={tramoTrackAnimating}
          on:animationstart={handleTramoAnimationStart}
          on:animationend={handleTramoAnimationEnd}
          on:animationcancel={handleTramoAnimationEnd}
        >
          <div class="tramo-panel tramo-primary">
            <TramoComposition
              path={primaryTramoPath}
              nodes={primaryTramoNodes}
              theme={module.theme}
              lockedStartT={primaryLockedStartT}
              renderScale={scale}
              interactive={!tramoRender}
              onNodeSelect={handleNodeSelect}
            />
          </div>

          {#if tramoRender}
            <div class="tramo-panel tramo-incoming">
              <TramoComposition
                path={incomingTramoPath}
                nodes={incomingTramoNodes}
                theme={module.theme}
                lockedStartT={incomingLockedStartT}
                renderScale={scale}
                interactive={false}
                onFirstRender={handleIncomingTramoReady}
              />
            </div>
          {/if}
        </div>
      {/if}

      <RouteHeader
        routeTitle={module.routeTitle}
        moduleNumber={module.moduleNumber}
        title={module.title}
        subtitle={module.subtitle}
        onBack={detailOpen ? onDetailClose : undefined}
      />

      {#if deferredVisualsReady}
        <ProgressCard
          completed={completedCount}
          total={module.total}
          percent={completionPercent}
          loading={moduleDataLoading}
        />
      {/if}

      {#if detailOpen && !detailExiting}
        <button
          class="detail-dismiss-zone"
          type="button"
          aria-label="Volver a la ruta"
          on:click={() => onDetailClose?.()}
        ></button>
      {/if}

      {#if detail && detailRendered}
        {#key detail.exerciseId}
          <ExerciseDetailPanel
            {detail}
            compact={compactLayout}
            exiting={detailExiting}
            runActive={exerciseRunActive}
            onRunRequested={onExerciseRunRequest}
          />
        {/key}
      {/if}

      {#if deferredVisualsReady}
        <BottomCta
          label={ctaLabel}
          targetTitle={ctaTargetTitle}
          disabled={!canContinue}
          loading={moduleDataLoading}
          action={detailActionAvailable ? "details" : "continue"}
          onContinue={continueToNextNode}
        />
      {/if}
    </section>
  </div>
  {#if activationError}
    <div class="route-activation-error" role="alert">
      {activationError}
    </div>
  {/if}
</main>

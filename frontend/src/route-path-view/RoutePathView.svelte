<script lang="ts">
  import { onMount } from "svelte";
  import BottomCta from "./components/BottomCta.svelte";
  import HeroTextSticker from "./components/HeroTextSticker.svelte";
  import NodeOverlay from "./components/NodeOverlay.svelte";
  import ProgressCard from "./components/ProgressCard.svelte";
  import RouteHeader from "./components/RouteHeader.svelte";
  import SnakeLayer from "./components/SnakeLayer.svelte";
  import { createPathSampler, type PathSampler } from "./path/pathMetrics";
  import { publicAsset, themeVars } from "./theme/moduleTheme";
  import type { NodeMotion, NodeStatus, RoutePathModuleView, RoutePathNode } from "./types/routePath";

  export let module: RoutePathModuleView;
  export let onNodeSelected: ((node: RoutePathNode) => void) | undefined = undefined;
  export let onContinueRequest:
    | ((payload: { fromNodeId?: string; nextNodeId?: string }) => void)
    | undefined = undefined;
  // Estado autoritativo empujado por el Extension Host: `busy` señala que el
  // engine está activando/abriendo un ejercicio; `error` el último fallo de
  // activación. La UI solo renderiza (no invita) y no adelanta la ruta.
  export let busyExerciseId: string | null = null;
  export let activationError: string | null = null;

  const stage = { width: 1086, height: 1448 };
  let scale = 1;
  let layoutWidth = stage.width;
  let layoutHeight = stage.height;
  let contentOffset = 0;
  let compactLayout = false;
  let routeArtScale = 1;
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
  const routeAnimationDuration = 860;
  const routeStartKick = 0.1;
  const routeNodeCommitFallbackProgress = 0.4;
  const nodeEdgeCommitRadius = 25;
  const nodeMotionDuration = 720;

  function updateScale() {
    const marginX = 28;
    const marginY = 22;
    const availableWidth = window.innerWidth - marginX;
    const availableHeight = window.innerHeight - marginY;
    // En paneles angostos (Lumen como columna derecha del editor) el layout se
    // compacta antes de bajar la escala global: el chrome anclado a bordes
    // conserva tamano legible y la ruta/snake absorbe el ajuste visual.
    const isNarrowPanel = availableWidth < 820;
    const compactLayoutWidth = isNarrowPanel ? 700 : 860;
    const compactStageHeight = isNarrowPanel ? 1304 : stage.height;
    const heightFit = Math.min(1, availableHeight / compactStageHeight);
    const widthFit = availableWidth / compactLayoutWidth;
    // La compresion horizontal solo puede aplicar un pequeno zoom-out extra
    // (6%) sobre el encaje por altura, y la escala nunca baja de 0.62: pasado
    // ese punto la ruta conserva su tamano, el layout sigue compactandose
    // (cards mas angostas) y el excedente vertical se resuelve con el scroll
    // de .lumen-route-app en vez de encoger el snake y los nodos.
    const minScale = Math.min(1, Math.max(0.62, heightFit * 0.94));
    let nextScale = Math.max(minScale, Math.min(1, heightFit, widthFit));
    // Zona ultra-angosta: si ni el layout minimo cabe con la escala fijada,
    // vuelve a encoger proporcionalmente; la UI completa vale mas que el piso.
    const minLayoutWidth = 540;
    if (minLayoutWidth * nextScale > availableWidth) {
      nextScale = Math.max(0.32, availableWidth / minLayoutWidth);
    }
    const expandedWidth = availableWidth / nextScale;
    compactLayout = isNarrowPanel;
    scale = nextScale;
    layoutHeight = compactStageHeight;
    layoutWidth = Math.max(minLayoutWidth, Math.min(2200, expandedWidth));
    contentOffset = (layoutWidth - stage.width) / 2;
    routeArtScale = compactLayout ? 0.9 : 1;
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

    return () => {
      window.removeEventListener("resize", updateScale);
      cancelAnimationFrame(splitAnimationFrame);
      nodeMotionTimers.forEach((timer) => window.clearTimeout(timer));
    };
  });

  $: if (module?.path?.pathD) {
    pathSampler = createPathSampler(module.path.pathD, module.path.transform);
  }

  const codeLines = [
    "#include <stdio.h>",
    "",
    "int main() {",
    "  char nombre[32];",
    "  gets(nombre);",
    "  printf(\"%s\", nombre);",
    "  return 0;",
    "}"
  ];

  const heroAsset = publicAsset("assets/route-hero/strings-chat-reference-hero.runtime.webp");

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

  $: snapshotActiveIndex = module.nodes.findIndex((node) => node.status === "active");
  // Sincroniza el índice mostrado con el snapshot. Si el snapshot avanza a un
  // índice mayor, corre la animación forward y transitions. Si retrocede o es
  // el mismo, ajusta sin animar (los saltos hacia atrás sólo pasan por
  // resnapshots del engine, nunca por click). `activeNodeIndex < 0` es el
  // primer render: se posiciona sin animación.
  $: if (mounted && splitAnimationReady && !isAdvancing && snapshotActiveIndex !== activeNodeIndex) {
    reconcileToSnapshotActive(snapshotActiveIndex);
  }
  $: interactiveNodes = module.nodes.map((node, index) => ({
    ...node,
    status: statusForNode(node, index, activeNodeIndex),
    motion: nodeMotionById[node.id],
    reviewMode: node.id === reviewNodeId && index < activeNodeIndex ? "repeat" as const : undefined
  }));
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
  $: canContinue = Boolean(activeNode) && !isAdvancing && !busyExerciseId;

  function statusForNode(node: RoutePathNode, _index: number, _currentIndex: number): NodeStatus {
    // `challenge` is a visual treatment for a locked challenge, not a locally
    // invented progression state. All unlock/completion authority stays in Rust.
    if (node.status === "locked" && node.type === "challenge") return "challenge";
    return node.status;
  }

  function continueToNextNode() {
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
    const targetNode = module.nodes[targetIndex];

    if (activeNodeIndex < 0) {
      activeNodeIndex = targetIndex;
      if (targetNode) displayedLockedStartT = targetNode.pathT;
      return;
    }

    if (!targetNode || targetIndex <= activeNodeIndex) {
      // Snapshot retrocedió (reimport, recarga) o no cambió: encaje directo.
      activeNodeIndex = targetIndex;
      if (targetNode) displayedLockedStartT = targetNode.pathT;
      return;
    }

    // Solo avanzar (targetIndex > activeNodeIndex): un paso a la vez basta para
    // el módulo strings; si el engine reporta un salto múltiple, animar al
    // final directo es aceptable y respeta el contrato "renderiza el snapshot".
    const previousNode = module.nodes[activeNodeIndex];
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
  class="lumen-route-app"
  class:route-busy={Boolean(busyExerciseId)}
  aria-busy={Boolean(busyExerciseId)}
  style={themeVars(module.theme)}
>
  <div
    class="stage-viewport"
    style={`width:${layoutWidth * scale}px; height:${layoutHeight * scale}px;`}
  >
    <section
      class="route-stage"
      class:compact={compactLayout}
      aria-label={`${module.routeTitle}, módulo ${module.moduleNumber}: ${module.title}`}
      style={`--stage-scale:${scale}; --layout-width:${layoutWidth}px; --stage-height:${layoutHeight}px; --content-offset:${contentOffset}px; --route-art-scale:${routeArtScale};`}
    >
      <div class="background-layer"></div>
      {#if deferredVisualsReady}
        <div class="code-ghost" aria-hidden="true">
          {#each codeLines as line}
            <span>{line || "\u00a0"}</span>
          {/each}
        </div>
      {/if}

      <RouteHeader
        routeTitle={module.routeTitle}
        moduleNumber={module.moduleNumber}
        title={module.title}
        subtitle={module.subtitle}
      />

      {#if deferredVisualsReady}
        <ProgressCard completed={completedCount} total={module.total} percent={completionPercent} />
      {/if}

      <SnakeLayer path={module.path} theme={module.theme} lockedStartT={displayedLockedStartT} renderScale={scale} />
      {#if deferredVisualsReady}
        <NodeOverlay
          path={module.path}
          nodes={interactiveNodes}
          theme={module.theme}
          isReviewing={Boolean(reviewNodeId)}
          onNodeSelect={handleNodeSelect}
        />
      {/if}

      <div class="hero-text-input">
        {#if deferredVisualsReady}
          <HeroTextSticker src={heroAsset} />
        {/if}
      </div>

      {#if deferredVisualsReady}
        <BottomCta
          label={module.nextAction.label}
          targetTitle={nextTargetTitle}
          disabled={!canContinue}
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
